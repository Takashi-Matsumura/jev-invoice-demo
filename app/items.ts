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
  /** 何回目の投入か。進捗は最後に投入したまとまりだけで数える */
  batch: number;
  phase: "queued" | "running" | "paused" | "done" | "error";
  status: string;
  /** 処理を始めた（再開した）時刻（Date.now()）。経過時間のカウントアップに使う */
  startedAt?: number;
  /** 一時停止までに処理していた時間の累計 */
  activeMs?: number;
  /** いま読んでいるページに取りかかった時刻。残り時間の目安に使う */
  pageStartedAt?: number;
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
  | { type: "add"; items: { id: string; name: string }[]; batch: number }
  | { type: "start"; id: string; at: number }
  | { type: "pause"; id: string; at: number }
  | { type: "event"; id: string; event: ClassifyEvent; at: number }
  | { type: "fail"; id: string; message: string }
  | { type: "clear" };

export function reducer(items: Item[], action: Action): Item[] {
  if (action.type === "add") {
    return [
      ...items,
      ...action.items.map((item): Item => ({
        ...item,
        batch: action.batch,
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
      // 再開のときは、読み終えたページ（pages）を残したまま続きから始める
      return {
        ...item,
        phase: "running",
        status: "PDF を読み込み中",
        startedAt: action.at,
        pageStartedAt: action.at,
      };
    }
    if (action.type === "pause") {
      return {
        ...item,
        phase: "paused",
        status: `一時停止中（再開すると ${item.pages.length + 1} ページ目から続けます）`,
        activeMs: (item.activeMs ?? 0) + action.at - (item.startedAt ?? action.at),
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
        return { ...item, pages: [...item.pages, event], pageStartedAt: action.at };
      case "checks":
        return {
          ...item,
          registrationNumbers: event.registrationNumbers,
          registrationMs: event.elapsedMs,
        };
      case "jev":
        return { ...item, exchange: event.exchange };
      case "result":
        return {
          ...item,
          phase: "done",
          verdict: event.verdict,
          elapsedMs: (item.activeMs ?? 0) + event.elapsedMs,
        };
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

/** 1 ページあたりの時間は、直近のこの枚数の平均で見積もる。途中で遅くなっても追従させるため */
const RECENT_PAGES = 10;

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const pageMs = (page: PageResult) => page.renderMs + page.ocrMs;

export type Progress = {
  /** 全件が終わるまでの残り時間の目安。1 ページも読み終えていない間は null */
  remainingMs: number | null;
  /** 最後に投入したまとまりの進み具合（0〜1） */
  fraction: number;
};

/**
 * 全体の進み具合と、残り時間の目安。
 * 時間のほとんどは OCR なので「残りページ数 × 1 ページあたりの時間」で見積もる。
 * 順番待ちの PDF はページ数がまだ分からないので、これまでの平均ページ数を当てる。
 */
export function estimateProgress(items: Item[], now: number): Progress {
  const batch = items.at(-1)?.batch;
  const current = items.filter((item) => item.batch === batch);
  const active = current.find((item) => item.phase === "running" || item.phase === "paused");
  const queued = current.filter((item) => item.phase === "queued").length;
  if (!active && queued === 0) return { remainingMs: 0, fraction: current.length > 0 ? 1 : 0 };

  // 速さは過去の投入分も含めて見る
  const pageTimes = items.flatMap((item) => item.pages.map(pageMs));
  if (pageTimes.length === 0) return { remainingMs: null, fraction: 0 };
  const msPerPage = mean(pageTimes.slice(-RECENT_PAGES));
  const pagesPerPdf = mean(
    items.flatMap((item) => (item.processedPages === undefined ? [] : [item.processedPages])),
  );

  let remainingMs = queued * pagesPerPdf * msPerPage;
  let spentOnPage = 0;
  if (active) {
    const pagesLeft =
      active.processedPages === undefined
        ? pagesPerPdf
        : active.processedPages - active.pages.length;
    if (pagesLeft > 0) {
      // 一時停止すると読みかけのページは最初からやり直しになるので、かけた時間は数えない
      if (active.phase === "running") {
        const spent = now - (active.pageStartedAt ?? now);
        spentOnPage = Math.min(Math.max(spent, 0), msPerPage);
      }
      remainingMs += pagesLeft * msPerPage - spentOnPage;
    }
  }

  const doneMs =
    current.reduce((sum, item) => sum + item.pages.reduce((s, page) => s + pageMs(page), 0), 0) +
    spentOnPage;
  return { remainingMs, fraction: doneMs / (doneMs + remainingMs) };
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
