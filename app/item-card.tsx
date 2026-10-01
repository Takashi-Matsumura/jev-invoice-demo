"use client";

import { useEffect, useState } from "react";
import {
  DOC_TYPE_LABELS,
  MIN_DOC_TYPE_CONFIDENCE,
  readAnswers,
  YES_THRESHOLD,
} from "@/lib/invoice-questions";
import { CATEGORY_LABELS } from "@/lib/verdict";
import { CATEGORY_STYLES, formatMs, STEPS, timingsOf, type Item } from "./items";

export function ItemCard({ item, onOpenDetail }: { item: Item; onOpenDetail: () => void }) {
  const { verdict } = item;
  // 「請求書」「請求書以外」はバッジで足りる。人の確認が要るものだけ理由を出す
  const showReasons = verdict?.category === "review" || verdict?.category === "unreadable";

  return (
    <li
      id={`item-${item.id}`}
      className={`rounded-xl border bg-white p-4 dark:bg-zinc-900 ${
        item.phase === "running"
          ? "border-indigo-400 dark:border-indigo-500"
          : item.phase === "paused"
            ? "border-amber-400 dark:border-amber-600"
            : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 truncate font-medium" title={item.name}>
          {item.name}
        </span>
        <span className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
          {item.phase === "running" && item.startedAt !== undefined && (
            <Elapsed startedAt={item.startedAt} baseMs={item.activeMs ?? 0} />
          )}
          {item.phase === "paused" && formatMs(item.activeMs ?? 0)}
          {item.elapsedMs !== undefined && formatMs(item.elapsedMs)}
        </span>
        <StatusBadge item={item} />
      </div>

      {item.phase === "running" && (
        <p className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="size-2 animate-pulse rounded-full bg-indigo-500" />
          {item.status}
        </p>
      )}

      {item.phase === "paused" && (
        <p className="mt-2 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
          <span className="size-2 rounded-full bg-amber-500" />
          {item.status}
        </p>
      )}

      {item.error && (
        <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{item.error}</p>
      )}

      {verdict && <Metrics item={item} />}

      {showReasons && (
        <ul className="mt-3 list-disc pl-5 text-sm text-amber-800 dark:text-amber-200">
          {verdict.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      {item.pages.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          {verdict ? <StepTimes item={item} /> : <span />}
          <button
            type="button"
            onClick={onOpenDetail}
            className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            詳細
          </button>
        </div>
      )}
    </li>
  );
}

/** 処理中の経過時間を数え続ける。baseMs は一時停止までに処理していた時間。 */
function Elapsed({ startedAt, baseMs }: { startedAt: number; baseMs: number }) {
  const [sinceStartMs, setSinceStartMs] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSinceStartMs(Date.now() - startedAt), 100);
    return () => clearInterval(timer);
  }, [startedAt]);

  return <>{((baseMs + sinceStartMs) / 1000).toFixed(1)} 秒</>;
}

export function StatusBadge({ item }: { item: Item }) {
  if (item.verdict) {
    return (
      <span
        className={`rounded-full px-3 py-1 text-sm font-semibold ${CATEGORY_STYLES[item.verdict.category]}`}
      >
        {CATEGORY_LABELS[item.verdict.category]}
      </span>
    );
  }
  const label = {
    queued: "順番待ち",
    running: "処理中",
    paused: "一時停止中",
    done: "完了",
    error: "エラー",
  }[item.phase];
  return (
    <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {label}
    </span>
  );
}

/** jev の答え（確率）を、数値が目に入る形で並べる。 */
function Metrics({ item }: { item: Item }) {
  const answers = item.exchange && readAnswers(item.exchange.response.answers);
  if (!answers) return null;

  // 項目の有無が分類に効くのは請求書のときだけなので、それ以外では注意色にしない
  const isInvoice = answers.docType === "invoice";
  const numbers = item.registrationNumbers ?? [];

  const cells = [
    {
      label: "書類の種類",
      value: answers.docTypeConfidence,
      note: DOC_TYPE_LABELS[answers.docType],
      ok: answers.docTypeConfidence >= MIN_DOC_TYPE_CONFIDENCE,
    },
    {
      label: "請求金額",
      value: answers.fields.has_total_amount,
      ok: !isInvoice || answers.fields.has_total_amount >= YES_THRESHOLD,
    },
    {
      label: "発行元",
      value: answers.fields.has_issuer,
      ok: !isInvoice || answers.fields.has_issuer >= YES_THRESHOLD,
    },
    {
      label: "発行日・年月",
      value: answers.fields.has_billing_date,
      ok: !isInvoice || answers.fields.has_billing_date >= YES_THRESHOLD,
    },
    {
      label: "登録番号",
      value: answers.hasRegistrationNumber,
      note: numbers.length > 0 ? numbers.map((n) => n.value).join(" ") : "文字列は未検出",
      ok: !isInvoice || numbers.some((n) => n.checkDigitValid),
    },
    {
      label: "途切れの疑い",
      value: answers.isTruncated,
      ok: !isInvoice || answers.isTruncated < YES_THRESHOLD,
    },
  ];

  return (
    <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className={`rounded-lg px-2.5 py-2 ${
            cell.ok
              ? "bg-zinc-100 dark:bg-zinc-800"
              : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          }`}
        >
          <dt className="text-xs opacity-70">{cell.label}</dt>
          <dd className="text-2xl leading-tight font-semibold tabular-nums">
            {Math.round(cell.value * 100)}
            <span className="text-sm font-normal">%</span>
          </dd>
          <dd className="h-4 truncate text-[11px] opacity-70" title={cell.note}>
            {cell.note}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StepTimes({ item }: { item: Item }) {
  const timings = timingsOf(item);
  const pages = item.pages.length;

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
      {STEPS.map(({ key, label, color }) => (
        <li key={key}>
          <span className={`mr-1.5 inline-block size-2 rounded-full ${color}`} />
          <span className="text-zinc-500 dark:text-zinc-400">{label}</span>{" "}
          <span className="font-semibold">{formatMs(timings[key])}</span>
          {key === "ocrMs" && pages > 0 && (
            <span className="text-zinc-500 dark:text-zinc-400">
              {" "}
              （{pages} ページ・{formatMs(timings.ocrMs / pages)}/ページ）
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
