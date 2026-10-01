import { describe, expect, it } from "vitest";
import { estimateProgress, reducer, type Item } from "./items";

const page = (ocrMs: number) => ({ page: 1, text: "", image: "", renderMs: 0, ocrMs });

function item(overrides: Partial<Item>): Item {
  return { id: "x", name: "x.pdf", batch: 1, phase: "queued", status: "", pages: [], ...overrides };
}

describe("estimateProgress", () => {
  it("1 ページも読み終えていなければ目安を出さない", () => {
    const items = [item({ phase: "running", processedPages: 4 }), item({})];
    expect(estimateProgress(items, 0)).toEqual({ remainingMs: null, fraction: 0 });
  });

  it("全件終わっていれば残り 0・進捗 100%", () => {
    const items = [item({ phase: "done", pages: [page(10_000)] })];
    expect(estimateProgress(items, 0)).toEqual({ remainingMs: 0, fraction: 1 });
  });

  it("処理中の残りページと、順番待ちの PDF（平均ページ数）を足す", () => {
    const items = [
      item({ phase: "done", processedPages: 2, pages: [page(10_000), page(10_000)] }),
      // 4 ページ中 1 ページ済み。2 ページ目に 4 秒かけたところ
      item({ phase: "running", processedPages: 4, pages: [page(10_000)], pageStartedAt: 1000 }),
      item({}),
    ];
    // 処理中: 6 秒 + 2 ページ × 10 秒 = 26 秒。順番待ち: 平均 3 ページ × 10 秒 = 30 秒
    // 済んだ分: 3 ページ × 10 秒 + 4 秒 = 34 秒
    expect(estimateProgress(items, 5000)).toEqual({ remainingMs: 56_000, fraction: 34 / 90 });
  });

  it("いまのページが平均より長引いても、残りを負にしない", () => {
    const items = [
      item({ phase: "running", processedPages: 2, pages: [page(10_000)], pageStartedAt: 0 }),
    ];
    expect(estimateProgress(items, 60_000)).toEqual({ remainingMs: 0, fraction: 1 });
  });

  it("一時停止中は、読みかけのページを最初からやり直す前提で見積もる", () => {
    const items = [
      item({ phase: "paused", processedPages: 3, pages: [page(10_000)], pageStartedAt: 0 }),
    ];
    expect(estimateProgress(items, 8_000)).toEqual({ remainingMs: 20_000, fraction: 1 / 3 });
  });

  it("1 ページあたりの時間は直近 10 ページで見る", () => {
    const slow = Array.from({ length: 10 }, () => page(30_000));
    const items = [
      item({ phase: "done", processedPages: 11, pages: [page(1_000), ...slow] }),
      item({}),
    ];
    expect(estimateProgress(items, 0).remainingMs).toBe(11 * 30_000);
  });

  it("進捗は最後に投入したまとまりだけで数え、速さは過去の分も使う", () => {
    const items = [
      item({ batch: 1, phase: "done", processedPages: 2, pages: [page(10_000), page(10_000)] }),
      item({ batch: 2 }),
    ];
    expect(estimateProgress(items, 0)).toEqual({ remainingMs: 20_000, fraction: 0 });
  });
});

describe("reducer の一時停止", () => {
  it("停止までの処理時間を累計し、完了時の処理時間に足す", () => {
    let items = [item({ id: "a" })];
    items = reducer(items, { type: "start", id: "a", at: 1_000 });
    items = reducer(items, { type: "pause", id: "a", at: 6_000 });
    expect(items[0]).toMatchObject({ phase: "paused", activeMs: 5_000 });

    items = reducer(items, { type: "start", id: "a", at: 60_000 });
    items = reducer(items, {
      type: "event",
      id: "a",
      at: 63_000,
      event: {
        type: "result",
        elapsedMs: 3_000,
        verdict: { category: "invoice", docType: "invoice", reasons: [] },
      },
    });
    expect(items[0]).toMatchObject({ phase: "done", elapsedMs: 8_000 });
  });
});
