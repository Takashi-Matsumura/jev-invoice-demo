import { describe, expect, it } from "vitest";
import { parseFieldBoxes } from "./field-boxes";

const PAGE_TEXT = [
  "株式会社オーシーシー 様",
  "00-5406-1459",
  "NTT西日本株式会社",
  "沖縄支店",
  "大阪府大阪市都島区東野田4-15-82",
  "2026年 9月ご請求分",
  "ご請求金額 8,470円",
  "登録番号：T7120001077523",
  "E41201221001 11408",
].join("\n");

const entry = (label: string, text: string, bbox: unknown = [100, 200, 300, 250]) => ({
  label,
  text,
  bbox_2d: bbox,
});

const parse = (entries: unknown[]) => parseFieldBoxes(JSON.stringify(entries), PAGE_TEXT);

describe("parseFieldBoxes", () => {
  it("0〜1000 の座標を、画像に対する割合に直す", () => {
    expect(parse([entry("total_amount", "8,470円", [650, 270, 750, 290])])).toEqual([
      {
        field: "total_amount",
        text: "8,470円",
        inOcrText: true,
        x: 0.65,
        y: 0.27,
        width: expect.closeTo(0.1),
        height: expect.closeTo(0.02),
      },
    ]);
  });

  it("```json の囲みや前置きがあっても読む", () => {
    const answer = `こちらです。\n\`\`\`json\n${JSON.stringify([entry("issuer", "NTT西日本株式会社")])}\n\`\`\``;
    expect(parseFieldBoxes(answer, PAGE_TEXT)).toHaveLength(1);
  });

  it("空白や全角・半角の違いは無視して OCR テキストと突き合わせる", () => {
    expect(parse([entry("billing_date", "2026年9月ご請求分")])).toMatchObject([{ inOcrText: true }]);
    expect(parse([entry("total_amount", "８，４７０円")])).toMatchObject([{ inOcrText: true }]);
  });

  it("OCR テキストに無い文字を答えた枠は、捨てずに印を付ける", () => {
    expect(parse([entry("issuer_address", "福岡県福岡市博多区博多駅中央街")])).toMatchObject([
      { field: "issuer_address", inOcrText: false },
    ]);
  });

  it("登録番号は T＋13桁として読めるものだけを残す", () => {
    expect(parse([entry("registration_number", "T7120001077523")])).toHaveLength(1);
    expect(parse([entry("registration_number", "E41201221001 11408")])).toEqual([]);
  });

  it("数字の無い金額・日付・お客様番号は捨てる", () => {
    expect(parse([entry("total_amount", "ご請求金額")])).toEqual([]);
    expect(parse([entry("billing_date", "ご請求分")])).toEqual([]);
    expect(parse([entry("customer_number", "様")])).toEqual([]);
  });

  it("請求先と、発行元の支店名・住所も囲む", () => {
    expect(
      parse([
        entry("recipient", "株式会社オーシーシー 様", [83, 93, 258, 105]),
        entry("customer_number", "00-5406-1459", [83, 273, 258, 287]),
        entry("issuer_branch", "沖縄支店", [780, 41, 837, 51]),
        entry("issuer_address", "大阪府大阪市都島区東野田４－１５－８２", [706, 97, 914, 107]),
      ]).map((box) => box.field),
    ).toEqual(["recipient", "customer_number", "issuer_branch", "issuer_address"]);
  });

  it("違う項目に同じ場所を答えていたら、どれも採らない", () => {
    expect(
      parse([
        entry("total_amount", "8,470円", [700, 50, 900, 70]),
        entry("billing_date", "2026年 9月ご請求分", [700, 50, 900, 70]),
        entry("issuer", "NTT西日本株式会社", [10, 10, 200, 30]),
      ]).map((box) => box.field),
    ).toEqual(["issuer"]);
  });

  it("同じ項目・同じ場所の繰り返しは 1 つにまとめる", () => {
    expect(parse([entry("issuer", "NTT西日本株式会社"), entry("issuer", "NTT西日本株式会社")])).toHaveLength(1);
  });

  it("知らない項目名、形の違う座標、つぶれた枠は捨てる", () => {
    expect(
      parse([
        entry("due_date", "2026年 9月ご請求分"),
        entry("issuer", "NTT西日本株式会社", [100, 200, 300]),
        entry("issuer", "NTT西日本株式会社", [100, 200, "300", 250]),
        entry("issuer", "NTT西日本株式会社", [300, 200, 100, 250]),
        "issuer",
        null,
      ]),
    ).toEqual([]);
  });

  it("画像の外にはみ出した座標は端に寄せる", () => {
    const [box] = parse([entry("issuer", "NTT西日本株式会社", [-20, 900, 1200, 1050])]);
    expect(box).toMatchObject({ x: 0, y: 0.9, width: 1 });
    expect(box.height).toBeCloseTo(0.1);
  });

  it("JSON として読めない答えは空にする", () => {
    expect(parseFieldBoxes("見つかりませんでした", PAGE_TEXT)).toEqual([]);
    expect(parseFieldBoxes('[{"label": "issuer", "text": "NTT', PAGE_TEXT)).toEqual([]);
    expect(parseFieldBoxes("[]", PAGE_TEXT)).toEqual([]);
  });
});
