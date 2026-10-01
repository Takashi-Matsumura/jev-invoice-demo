"use client";

import { useEffect, useState } from "react";
import { estimateProgress, type Item } from "./items";

const SIZE = 116;
const STROKE = 9;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * 処理中に、PDF の投入欄の代わりに出す進捗表示。
 * 輪で全体の進み具合を、中央に残り時間を、横に完了予定時刻の目安を出す。
 */
export function ProgressClock({
  items,
  paused,
  onPause,
  onResume,
}: {
  items: Item[];
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
}) {
  const [now, setNow] = useState<number | null>(null);

  // 一時停止中は時計も止める
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [paused]);

  const { remainingMs, fraction } = estimateProgress(items, now ?? 0);
  const batch = items.at(-1)?.batch;
  const current = items.filter((item) => item.batch === batch);
  const finished = current.filter((item) => item.phase === "done" || item.phase === "error").length;

  const finishAt =
    paused || now === null || remainingMs === null
      ? null
      : new Date(now + remainingMs).toLocaleTimeString("ja-JP", {
          hour: "numeric",
          minute: "2-digit",
        });

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border-2 px-4 py-4 ${
        paused
          ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
          : "border-indigo-200 bg-white dark:border-indigo-900 dark:bg-zinc-900"
      }`}
    >
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden="true">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-zinc-200 dark:stroke-zinc-700"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            className={`transition-[stroke-dashoffset] duration-700 ${
              paused ? "stroke-amber-500" : "stroke-indigo-500"
            }`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <Remaining ms={remainingMs} />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {paused ? "一時停止中" : "完了予定（目安）"}
          </p>
          <p className="text-xl font-semibold tabular-nums">
            {paused ? "—" : finishAt ? `${finishAt} ごろ` : "計算中"}
          </p>
        </div>
        <p className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          {finished} / {current.length} 件・{Math.round(fraction * 100)}%
        </p>
        <button
          type="button"
          onClick={paused ? onResume : onPause}
          className={`rounded-md px-3 py-1.5 font-medium ${
            paused
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          {paused ? "再開" : "一時停止"}
        </button>
      </div>
    </div>
  );
}

function Remaining({ ms }: { ms: number | null }) {
  if (ms === null) {
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">計算中</span>;
  }
  const underMinute = ms < 60_000;
  return (
    <>
      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
        {underMinute ? "あと" : "あと約"}
      </span>
      <span className="my-0.5 text-3xl font-semibold tabular-nums">
        {underMinute ? 1 : Math.round(ms / 60_000)}
      </span>
      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
        {underMinute ? "分以内" : "分"}
      </span>
    </>
  );
}
