import { describe, expect, it } from "vitest";
import { isRepeatingTranscript, pickMissedLines } from "./ocr-review";

const OCR_TEXT = [
  "請求書",
  "株式会社オーシーシー 様",
  "ご請求金額",
  "8,470円",
  "NTT西日本株式会社",
  "沖縄支店",
  "0120-747488",
].join("\n");

describe("pickMissedLines", () => {
  it("書き起こしに無かった行だけを残す", () => {
    const answer = [
      "発行年月日 2026年9月17日発行",
      "大阪府大阪市都島区東野田4-15-82",
      "ご請求金額",
      "NTT西日本株式会社",
    ].join("\n");
    expect(pickMissedLines(answer, OCR_TEXT)).toEqual([
      "発行年月日 2026年9月17日発行",
      "大阪府大阪市都島区東野田4-15-82",
    ]);
  });

  it("書き起こし済みの文字を含んでいても、行として新しければ残す", () => {
    expect(pickMissedLines("お問合せ先 0120-747488（無料）", OCR_TEXT)).toEqual([
      "お問合せ先 0120-747488（無料）",
    ]);
  });

  it("空白や全角・半角の違いだけの行は、書き起こし済みとして捨てる", () => {
    expect(pickMissedLines("株式会社オーシーシー様\n８，４７０円", OCR_TEXT)).toEqual([]);
  });

  it("「なし」と空行は捨てる", () => {
    expect(pickMissedLines("なし", OCR_TEXT)).toEqual([]);
    expect(pickMissedLines("なし。\n\n", OCR_TEXT)).toEqual([]);
  });

  it("答えの中で同じ行が繰り返されたら 1 つにまとめる", () => {
    expect(pickMissedLines("【還付先】\n【還付先】", OCR_TEXT)).toEqual(["【還付先】"]);
  });
});

describe("isRepeatingTranscript", () => {
  it("書き起こし済みの行が 3 行続いたら打ち切る", () => {
    const answer = "【還付先】\n請求書\n株式会社オーシーシー 様\nご請求金額\n8,4";
    expect(isRepeatingTranscript(answer, OCR_TEXT)).toBe(true);
  });

  it("書きかけの最後の行は数えない", () => {
    expect(isRepeatingTranscript("請求書\nご請求金額\n沖縄支店", OCR_TEXT)).toBe(false);
  });

  it("新しい行が続いている間は打ち切らない", () => {
    const answer = "請求書\nご請求金額\n【還付先】\n福岡県福岡市博多区\n";
    expect(isRepeatingTranscript(answer, OCR_TEXT)).toBe(false);
  });

  it("空行は数えない", () => {
    expect(isRepeatingTranscript("請求書\n\n\n\n", OCR_TEXT)).toBe(false);
  });
});
