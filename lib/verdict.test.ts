import { describe, expect, it } from "vitest";
import type { InvoiceAnswers } from "./invoice-questions";
import type { RegistrationNumber } from "./registration-number";
import { decideVerdict } from "./verdict";

const VALID: RegistrationNumber[] = [{ value: "T9011101031552", checkDigitValid: true }];

function answers(overrides: Partial<InvoiceAnswers> = {}): InvoiceAnswers {
  return {
    docType: "invoice",
    docTypeConfidence: 0.95,
    fields: { has_total_amount: 0.9, has_issuer: 0.9, has_billing_date: 0.9 },
    hasRegistrationNumber: 0.9,
    isTruncated: 0.1,
    ...overrides,
  };
}

describe("decideVerdict", () => {
  it("請求書で、登録番号と必須項目が揃っていれば「請求書」", () => {
    expect(decideVerdict(answers(), VALID).category).toBe("invoice");
  });

  it("登録番号が無い請求書は「要確認」", () => {
    const verdict = decideVerdict(answers({ hasRegistrationNumber: 0.1 }), []);
    expect(verdict.category).toBe("review");
    expect(verdict.reasons).toEqual(["登録番号（T＋13桁）が見つかりません"]);
  });

  it("jev は登録番号ありと言うが文字列で拾えない場合、OCR の読み違いを疑う", () => {
    const verdict = decideVerdict(answers(), []);
    expect(verdict.category).toBe("review");
    expect(verdict.reasons[0]).toContain("OCR の読み違い");
  });

  it("チェックデジットに合わない登録番号しか無ければ「要確認」", () => {
    const verdict = decideVerdict(answers(), [
      { value: "T9011101031558", checkDigitValid: false },
    ]);
    expect(verdict.category).toBe("review");
    expect(verdict.reasons[0]).toContain("T9011101031558");
  });

  it("必須項目の欠けや途切れは、理由を全部並べて「要確認」", () => {
    const verdict = decideVerdict(
      answers({
        fields: { has_total_amount: 0.2, has_issuer: 0.9, has_billing_date: 0.9 },
        isTruncated: 0.8,
      }),
      VALID,
    );
    expect(verdict.category).toBe("review");
    expect(verdict.reasons).toHaveLength(2);
  });

  it("確信度の低い請求書判定は「要確認」", () => {
    expect(decideVerdict(answers({ docTypeConfidence: 0.4 }), VALID).category).toBe("review");
  });

  it("納品書は「請求書以外」", () => {
    const verdict = decideVerdict(answers({ docType: "delivery_note" }), []);
    expect(verdict.category).toBe("not_invoice");
    expect(verdict.docType).toBe("delivery_note");
  });

  it("請求書以外でも確信度が低ければ「要確認」", () => {
    const verdict = decideVerdict(answers({ docType: "other", docTypeConfidence: 0.4 }), []);
    expect(verdict.category).toBe("review");
  });
});
