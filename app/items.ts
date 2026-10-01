/** 画面が持つ PDF ごとの状態と、表示用の小さなヘルパー。 */

import type { ClassifyEvent } from "@/lib/events";
import type { JevExchange } from "@/lib/jev";
import type { RegistrationNumber } from "@/lib/registration-number";
import type { Category, Verdict } from "@/lib/verdict";

export type PageResult = {
  page: number;
  text: string;
  image: string;
  renderMs: number;
  ocrMs: number;
};

export type Item = {
  id: string;
  name: string;
  phase: "queued" | "running" | "done" | "error";
  status: string;
  /** 処理を始めた時刻（Date.now()）。経過時間のカウントアップに使う */
  startedAt?: number;
  pageCount?: number;
  processedPages?: number;
  pages: PageResult[];
  registrationNumbers?: RegistrationNumber[];
  registrationMs?: number;
  exchange?: JevExchange;
  verdict?: Verdict;
  elapsedMs?: number;
  error?: string;
};

export type Action =
  | { type: "add"; items: { id: string; name: string }[] }
  | { type: "start"; id: string; startedAt: number }
  | { type: "event"; id: string; event: ClassifyEvent }
  | { type: "fail"; id: string; message: string }
  | { type: "clear" };

export function reducer(items: Item[], action: Action): Item[] {
  if (action.type === "add") {
    return [
      ...items,
      ...action.items.map((item): Item => ({
        ...item,
        phase: "queued",
        status: "順番待ち",
        pages: [],
      })),
    ];
  }
  if (action.type === "clear") return [];

  return items.map((item) => {
    if (item.id !== action.id) return item;
    if (action.type === "start") {
      return {
        ...item,
        phase: "running",
        status: "PDF を読み込み中",
        startedAt: action.startedAt,
      };
    }
    if (action.type === "fail") {
      return { ...item, phase: "error", error: action.message };
    }

    const { event } = action;
    switch (event.type) {
      case "meta":
        return { ...item, pageCount: event.pageCount, processedPages: event.processedPages };
      case "status":
        return { ...item, status: event.message };
      case "page":
        return { ...item, pages: [...item.pages, event] };
      case "checks":
        return {
          ...item,
          registrationNumbers: event.registrationNumbers,
          registrationMs: event.elapsedMs,
        };
      case "jev":
        return { ...item, exchange: event.exchange };
      case "result":
        return { ...item, phase: "done", verdict: event.verdict, elapsedMs: event.elapsedMs };
      case "error":
        return { ...item, phase: "error", error: event.message };
    }
  });
}

export const STEPS = [
  { key: "renderMs", label: "画像化", color: "bg-zinc-400" },
  { key: "ocrMs", label: "AI-OCR", color: "bg-indigo-500" },
  { key: "registrationMs", label: "登録番号の検出", color: "bg-emerald-500" },
  { key: "jevMs", label: "jev 判定", color: "bg-amber-500" },
] as const;

export type Timings = Record<(typeof STEPS)[number]["key"], number>;

export function timingsOf(item: Item): Timings {
  return {
    renderMs: item.pages.reduce((sum, page) => sum + page.renderMs, 0),
    ocrMs: item.pages.reduce((sum, page) => sum + page.ocrMs, 0),
    registrationMs: item.registrationMs ?? 0,
    jevMs: item.exchange?.elapsedMs ?? 0,
  };
}

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} 秒`;
  if (ms >= 1) return `${Math.round(ms)} ms`;
  return "1 ms 未満";
}

export const CATEGORY_STYLES: Record<Category, string> = {
  invoice: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  review: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  not_invoice: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  unreadable: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};
