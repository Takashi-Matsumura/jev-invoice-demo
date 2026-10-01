import type { ClassifyEvent } from "@/lib/events";
import { QUESTIONS, readAnswers } from "@/lib/invoice-questions";
import { askJev } from "@/lib/jev";
import { ocrImage, openPdf, type OpenedPdf } from "@/lib/ocr";
import { findRegistrationNumbers } from "@/lib/registration-number";
import { decideVerdict, MIN_OCR_CHARS, unreadableVerdict } from "@/lib/verdict";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 10;
/** jev に送る本文の上限（全ページ合計）。jev の入力は state と質問 1 つで 32K トークンまで */
const MAX_STATE_CHARS = 16_000;

/**
 * PDF 1 件を受け取り、画像化 → OCR → 登録番号の検出 → jev → 判定 の各段階を NDJSON で流す。
 * 複数ファイルはクライアントが 1 件ずつ送ってくる。
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "不正なリクエスト元です" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "リクエストを読み取れません" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "PDF ファイルが指定されていません" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "ファイルが大きすぎます（20MB まで）" }, { status: 413 });
  }

  const doneTexts = parseDoneTexts(formData.get("done"));

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return Response.json({ error: "PDF ファイルを指定してください" }, { status: 400 });
  }

  let pdf: OpenedPdf;
  try {
    pdf = openPdf(bytes);
  } catch (error) {
    return Response.json(
      { error: `PDF を開けません: ${messageOf(error)}` },
      { status: 400 },
    );
  }

  const cancel = new AbortController();
  const signal = AbortSignal.any([request.signal, cancel.signal]);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ClassifyEvent) => {
        if (!signal.aborted) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };

      const startedAt = performance.now();
      const elapsed = () => Math.round(performance.now() - startedAt);

      try {
        const processedPages = Math.min(pdf.pageCount, MAX_PAGES);
        send({ type: "meta", pageCount: pdf.pageCount, processedPages });

        // 一時停止からの再開では、読み終えたページのテキストを受け取り、続きのページから始める
        const texts = doneTexts.slice(0, processedPages);
        for (let i = texts.length; i < processedPages; i++) {
          send({
            type: "status",
            message: `${i + 1}/${processedPages} ページ目を文字起こし中（ローカル AI-OCR）`,
          });
          const renderStartedAt = performance.now();
          const { png, preview } = pdf.renderPage(i);
          const ocrStartedAt = performance.now();
          const text = await ocrImage(png, signal);
          texts.push(text);
          send({
            type: "page",
            page: i + 1,
            text,
            image: preview,
            renderMs: Math.round(ocrStartedAt - renderStartedAt),
            ocrMs: Math.round(performance.now() - ocrStartedAt),
          });
        }

        const checksStartedAt = performance.now();
        const registrationNumbers = findRegistrationNumbers(texts.join("\n"));
        send({
          type: "checks",
          registrationNumbers,
          // 1 ms に満たないことが多いので、小数第 2 位まで残す
          elapsedMs: Math.round((performance.now() - checksStartedAt) * 100) / 100,
        });

        const totalChars = texts.reduce((sum, t) => sum + t.trim().length, 0);
        if (totalChars < MIN_OCR_CHARS) {
          send({
            type: "result",
            verdict: unreadableVerdict(
              `文字をほとんど読み取れませんでした（${totalChars} 文字）`,
            ),
            elapsedMs: elapsed(),
          });
          return;
        }

        send({ type: "status", message: "jev で分類中（OCR テキストを外部 API に送信）" });
        const perPage = Math.floor(MAX_STATE_CHARS / texts.length);
        const state = {
          pages: texts.map((text, i) => ({ page: i + 1, text: text.slice(0, perPage) })),
        };
        const exchange = await askJev(state, QUESTIONS, signal);
        send({ type: "jev", exchange });

        const answers = readAnswers(exchange.response.answers);
        send({
          type: "result",
          verdict: answers
            ? decideVerdict(answers, registrationNumbers)
            : unreadableVerdict("jev の応答が想定した形ではありませんでした"),
          elapsedMs: elapsed(),
        });
      } catch (error) {
        send({ type: "error", message: messageOf(error) });
      } finally {
        pdf.close();
        if (!signal.aborted) controller.close();
      }
    },
    cancel() {
      cancel.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** 読み終えたページの OCR テキスト（JSON の文字列配列）。形が違えば、最初から読み直す。 */
function parseDoneTexts(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((text) => typeof text === "string")) return [];
    return parsed.map((text) => text.slice(0, MAX_STATE_CHARS));
  } catch {
    return [];
  }
}

/** ブラウザからの他サイト経由の呼び出しを拒否する。Origin を付けない curl などは通す。 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
