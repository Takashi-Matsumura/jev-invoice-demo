"use client";

import { useEffect, useState } from "react";
import { estimateRemainingMs, type Item } from "./items";

/** 全件が終わるまでの目安。処理が進むたび、また 1 秒ごとに見積もり直す。 */
export function Eta({ items }: { items: Item[] }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (now === null) return null;
  const remainingMs = estimateRemainingMs(items, now);
  if (remainingMs === null) {
    return <span className="text-zinc-500 dark:text-zinc-400">完了の目安を計算中</span>;
  }

  const finishAt = new Date(now + remainingMs).toLocaleTimeString("ja-JP", {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-medium text-indigo-900 tabular-nums dark:bg-indigo-950 dark:text-indigo-200">
      {formatRemaining(remainingMs)}（{finishAt} ごろ完了の目安）
    </span>
  );
}

function formatRemaining(ms: number): string {
  if (ms < 60_000) return "あと 1 分以内";
  return `あと約 ${Math.round(ms / 60_000)} 分`;
}
