import { describe, expect, it } from "vitest";
import { findRegistrationNumbers, isValidCorporateNumber } from "./registration-number";

describe("isValidCorporateNumber", () => {
  it("公開されている実在の法人番号を通す", () => {
    expect(isValidCorporateNumber("9011101031552")).toBe(true); // KDDI
    expect(isValidCorporateNumber("8011101028104")).toBe(true); // NTT東日本
  });

  it("1 桁違いを弾く", () => {
    expect(isValidCorporateNumber("9011101031553")).toBe(false);
    expect(isValidCorporateNumber("8011101028104".replace(/^8/, "7"))).toBe(false);
  });

  it("13 桁でなければ弾く", () => {
    expect(isValidCorporateNumber("901110103155")).toBe(false);
    expect(isValidCorporateNumber("")).toBe(false);
  });
});

describe("findRegistrationNumbers", () => {
  it("本文中の登録番号を拾う", () => {
    expect(findRegistrationNumbers("登録番号：T9011101031552\nご請求金額 12,345円")).toEqual([
      { value: "T9011101031552", checkDigitValid: true },
    ]);
  });

  it("全角や、空白・ハイフン入りの表記を拾う", () => {
    expect(findRegistrationNumbers("登録番号 Ｔ９０１１１０１０３１５５２")[0]?.value).toBe(
      "T9011101031552",
    );
    expect(findRegistrationNumbers("T 9011-1010-31552")[0]?.value).toBe("T9011101031552");
  });

  it("読み違いと思われる番号は、見つけたうえでチェックデジット不一致とする", () => {
    expect(findRegistrationNumbers("登録番号 T9011101031558")).toEqual([
      { value: "T9011101031558", checkDigitValid: false },
    ]);
  });

  it("同じ番号は 1 件にまとめる", () => {
    expect(findRegistrationNumbers("T9011101031552 / T9011101031552")).toHaveLength(1);
  });

  it("電話番号や桁数の合わない数字列は拾わない", () => {
    expect(findRegistrationNumbers("TEL 03-1234-5678")).toEqual([]);
    expect(findRegistrationNumbers("T901110103155")).toEqual([]); // 12 桁
    expect(findRegistrationNumbers("T90111010315520")).toEqual([]); // 14 桁
    expect(findRegistrationNumbers("NT9011101031552")).toEqual([]);
    expect(findRegistrationNumbers("T90111\n01031552")).toEqual([]); // 行またぎ
  });
});
