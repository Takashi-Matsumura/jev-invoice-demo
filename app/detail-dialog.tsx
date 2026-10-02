"use client";

import { useEffect, useRef } from "react";
import { BOX_FIELD_LABELS, type BoxField } from "@/lib/field-boxes";
import { DOC_TYPE_LABELS, QUESTION_LABELS } from "@/lib/invoice-questions";
import type { JevAnswer, JevExchange } from "@/lib/jev";
import { StatusBadge } from "./item-card";
import { formatMs, type Item, type PageResult } from "./items";

const BOX_FIELDS = Object.keys(BOX_FIELD_LABELS) as BoxField[];

/** 枠の色。スキャンした紙の上でも、画面の明暗によらず見分けられる濃さにしている */
const BOX_STYLES: Record<BoxField, { outline: string; fill: string }> = {
  total_amount: { outline: "outline-rose-600", fill: "bg-rose-600" },
  issuer: { outline: "outline-indigo-600", fill: "bg-indigo-600" },
  billing_date: { outline: "outline-amber-600", fill: "bg-amber-600" },
  registration_number: { outline: "outline-emerald-600", fill: "bg-emerald-600" },
};

/** PDF 1 件の処理の中身（OCR 結果、登録番号、jev とのやり取り）を見せるモーダル。 */
export function DetailDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  // 閉じるのは親がこのコンポーネントを外すことで行う。ここで close() を呼ぶと close イベントが
  // onClose を起こし、開発時の StrictMode（マウントし直し）で開いた直後に閉じてしまう
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // 背景（dialog 自身）のクリックで閉じる。中身のクリックは内側の div が受ける
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[min(72rem,calc(100vw-2rem))] max-w-none rounded-xl bg-white p-0 text-sm text-zinc-900 shadow-xl backdrop:bg-black/50 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold" title={item.name}>
            {item.name}
          </h2>
          <StatusBadge item={item} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            閉じる
          </button>
        </header>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-4">
          {item.verdict && (
            <Section title="判定の理由">
              <ul className="list-disc pl-5">
                {item.verdict.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="1. AI-OCR（この PC の中で実行）">
            {item.pageCount !== undefined &&
              item.processedPages !== undefined &&
              item.pageCount > item.processedPages && (
                <p className="text-amber-700 dark:text-amber-300">
                  全 {item.pageCount} ページのうち、先頭 {item.processedPages} ページだけを読みました
                </p>
              )}
            {item.pages.map((page) => (
              <div key={page.page} className="grid gap-3 md:grid-cols-2">
                <PageImage page={page} />
                <div>
                  <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {page.page} ページ目・{page.text.length} 文字・画像化 {formatMs(page.renderMs)}
                    ・OCR {formatMs(page.ocrMs)}・位置検出 {formatMs(page.locateMs)}
                  </p>
                  <pre className="max-h-[32rem] overflow-auto rounded bg-zinc-100 p-3 font-mono text-xs whitespace-pre-wrap dark:bg-zinc-800">
                    {page.text || "（文字なし）"}
                  </pre>
                </div>
              </div>
            ))}
          </Section>

          {item.registrationNumbers && (
            <Section title="2. 登録番号の検出（ルールによる確定的な処理）">
              {item.registrationNumbers.length === 0 ? (
                <p>T＋13桁の文字列は見つかりませんでした。</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {item.registrationNumbers.map((n) => (
                    <li key={n.value}>
                      <span className="font-mono">{n.value}</span>{" "}
                      {n.checkDigitValid ? (
                        <span className="text-emerald-700 dark:text-emerald-300">
                          チェックデジット一致
                        </span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">
                          チェックデジット不一致
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {item.exchange && (
            <Section title="3. jev への質問と答え（OCR テキストを外部 API に送信）">
              <JevPanel exchange={item.exchange} />
            </Section>
          )}
        </div>
      </div>
    </dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** ページ画像に、重要な項目を囲む枠を重ねる。 */
function PageImage({ page }: { page: PageResult }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {BOX_FIELDS.map((field) => {
          const found = page.boxes.some((box) => box.field === field);
          return (
            <li
              key={field}
              className={found ? "" : "text-zinc-400 line-through dark:text-zinc-500"}
              title={found ? undefined : "このページでは見つかりませんでした"}
            >
              <span
                className={`mr-1 inline-block size-2 rounded-sm ${found ? BOX_STYLES[field].fill : "bg-zinc-300 dark:bg-zinc-600"}`}
              />
              {BOX_FIELD_LABELS[field]}
            </li>
          );
        })}
      </ul>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL なので最適化の対象外 */}
        <img
          src={page.image}
          alt={`${page.page} ページ目`}
          className="block w-full rounded border border-zinc-200 dark:border-zinc-700"
        />
        {page.boxes.map((box, i) => (
          <div
            key={i}
            title={`${BOX_FIELD_LABELS[box.field]}: ${box.text}`}
            className={`absolute rounded-sm outline-2 outline-offset-2 ${BOX_STYLES[box.field].outline}`}
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          />
        ))}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        枠の位置はローカルの AI が答えたものです。読み取った文字が OCR
        の結果と合うものだけを囲んでいます。
      </p>
    </div>
  );
}

function JevPanel({ exchange }: { exchange: JevExchange }) {
  const { request, response, elapsedMs } = exchange;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {response.model}・応答 {elapsedMs} ms・入力 {response.usage.input_tokens} トークン
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(request.questions).map(([key, question]) => (
          <div key={key} className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
            <p className="font-medium">{QUESTION_LABELS[key] ?? key}</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {question.instructions}
            </p>
            <div className="mt-2">
              <Answer answer={response.answers[key]} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Answer({ answer }: { answer: JevAnswer | undefined }) {
  if (!answer) return <p>（答えなし）</p>;

  if (answer.type === "noul") {
    return <Bar label="はい" value={answer.noul} />;
  }

  return (
    <div className="flex flex-col gap-1">
      {Object.entries(answer.probabilities)
        .sort(([, a], [, b]) => b - a)
        .map(([option, probability]) => (
          <Bar
            key={option}
            label={DOC_TYPE_LABELS[option as keyof typeof DOC_TYPE_LABELS] ?? option}
            value={probability}
            highlight={option === answer.choice}
          />
        ))}
    </div>
  );
}

function Bar({ label, value, highlight = true }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full ${highlight ? "bg-zinc-800 dark:bg-zinc-100" : "bg-zinc-400 dark:bg-zinc-500"}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}
