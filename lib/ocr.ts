/**
 * PDF をページごとに画像化し、ローカルの vision 対応 LLM（llama-server）で文字起こしする。
 * 同じ LLM に、重要な項目が画像のどこに書かれているかも答えさせる。
 * 画像は PC の外に出ない。
 */

import * as mupdf from "mupdf";
import { LOCATE_PROMPT, parseFieldBoxes, type FieldBox } from "./field-boxes";

const RENDER_SCALE = 2; // 約 144 DPI。OCR に足りる細かさで、画像が大きくなりすぎない
const PREVIEW_SCALE = 3; // 約 216 DPI。画面で拡大して、細かい文字を目で確かめられる細かさ
const PREVIEW_JPEG_QUALITY = 70;
const OCR_TIMEOUT_MS = 180_000;
const OCR_MAX_TOKENS = 4096;
const LOCATE_TIMEOUT_MS = 90_000;
const LOCATE_MAX_TOKENS = 2048;

const OCR_PROMPT =
  "この画像に写っている文字を、レイアウトの上から下・左から右の順序通りに、省略せず正確に書き起こしてください。" +
  "説明文や前置き・後書き、Markdown装飾は一切付けず、書き起こしたテキストのみを出力してください。" +
  "文字が全く無い画像の場合は空文字を返してください。";

export type RenderedPage = {
  /** OCR に渡す PNG（base64） */
  png: string;
  /** 画面表示用の JPEG（data URL）。拡大して見るので、OCR 用より細かい */
  preview: string;
};

export type OpenedPdf = {
  pageCount: number;
  renderPage(index: number): RenderedPage;
  close(): void;
};

/** PDF として開けなければ例外を投げる。 */
export function openPdf(bytes: Uint8Array): OpenedPdf {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  if (doc.needsPassword()) {
    doc.destroy();
    throw new Error("パスワード付きの PDF は扱えません");
  }

  return {
    pageCount: doc.countPages(),
    renderPage(index) {
      const page = doc.loadPage(index);
      const render = (scale: number) =>
        page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
      try {
        const forOcr = render(RENDER_SCALE);
        const png = Buffer.from(forOcr.asPNG()).toString("base64");
        forOcr.destroy();

        const forPreview = render(PREVIEW_SCALE);
        const jpeg = Buffer.from(forPreview.asJPEG(PREVIEW_JPEG_QUALITY)).toString("base64");
        forPreview.destroy();

        return { png, preview: `data:image/jpeg;base64,${jpeg}` };
      } finally {
        page.destroy();
      }
    },
    close() {
      doc.destroy();
    },
  };
}

type ChatMessage = { role: "user" | "assistant"; content: unknown };

const ocrRequest = (base64Png: string): ChatMessage => ({
  role: "user",
  content: [
    { type: "text", text: OCR_PROMPT },
    { type: "image_url", image_url: { url: `data:image/png;base64,${base64Png}` } },
  ],
});

export async function ocrImage(base64Png: string, signal?: AbortSignal): Promise<string> {
  return chat([ocrRequest(base64Png)], OCR_MAX_TOKENS, OCR_TIMEOUT_MS, signal);
}

/**
 * 重要な項目が画像のどこに書かれているかを答えさせる。ocrText は同じ画像の OCR 結果。
 *
 * OCR の続きの会話として尋ねる。llama-server に残っている OCR のときのキャッシュが効き、
 * 画像を読み直さずに済む。位置が取れなくても仕分けは続けたいので、失敗は空配列にする。
 */
export async function locateFields(
  base64Png: string,
  ocrText: string,
  signal?: AbortSignal,
): Promise<FieldBox[]> {
  try {
    const answer = await chat(
      [
        ocrRequest(base64Png),
        { role: "assistant", content: ocrText },
        { role: "user", content: LOCATE_PROMPT },
      ],
      LOCATE_MAX_TOKENS,
      LOCATE_TIMEOUT_MS,
      signal,
    );
    return parseFieldBoxes(answer, ocrText);
  } catch (error) {
    if (signal?.aborted) throw error;
    return [];
  }
}

async function chat(
  messages: ChatMessage[],
  maxTokens: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  const baseUrl = process.env.LLAMA_VLM_BASE_URL ?? "http://localhost:8084";
  const model = process.env.LLAMA_VLM_MODEL ?? "default";

  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, messages }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });

  if (!res.ok) {
    throw new Error(`OCR 用の LLM サーバがエラーを返しました (${res.status})`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}
