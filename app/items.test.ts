import { describe, expect, it } from "vitest";
import { estimateRemainingMs, type Item } from "./items";

const page = (ocrMs: number) => ({ page: 1, text: "", image: "", renderMs: 0, ocrMs });

function item(overrides: Partial<Item>): Item {
  return { id: "x", name: "x.pdf", phase: "queued", status: "", pages: [], ...overrides };
}

describe("estimateRemainingMs", () => {
  it("1 ページも読み終えていなければ目安を出さない", () => {
    const items = [item({ phase: "running", processedPages: 4 }), item({})];
    expect(estimateRemainingMs(items, 0)).toBeNull();
  });

  it("残りが無ければ null", () => {
    expect(estimateRemainingMs([item({ phase: "done", pages: [page(10_000)] })], 0)).toBeNull();
  });

  it("処理中の残りページと、順番待ちの PDF（平均ページ数）を足す", () => {
    const items = [
      item({ phase: "done", processedPages: 2, pages: [page(10_000), page(10_000)] }),
      // 4 ページ中 1 ページ済み。2 ページ目に 4 秒かけたところ
      item({ phase: "running", processedPages: 4, pages: [page(10_000)], pageStartedAt: 1000 }),
      item({}),
    ];
    // 処理中: 6 秒 + 2 ページ × 10 秒 = 26 秒。順番待ち: 平均 3 ページ × 10 秒 = 30 秒
    expect(estimateRemainingMs(items, 5000)).toBe(56_000);
  });

  it("いまのページが平均より長引いても、残りを負にしない", () => {
    const items = [
      item({ phase: "running", processedPages: 2, pages: [page(10_000)], pageStartedAt: 0 }),
    ];
    expect(estimateRemainingMs(items, 60_000)).toBe(0);
  });

  it("1 ページあたりの時間は直近 10 ページで見る", () => {
    const slow = Array.from({ length: 10 }, () => page(30_000));
    const items = [
      item({ phase: "done", processedPages: 11, pages: [page(1_000), ...slow] }),
      item({}),
    ];
    expect(estimateRemainingMs(items, 0)).toBe(11 * 30_000);
  });
});
