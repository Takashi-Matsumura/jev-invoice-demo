/**
 * jev の答えと登録番号の検出結果から、最終的な分類を決める。
 * ここはルールだけで決まる純粋関数で、AI は関与しない。
 */

import {
  DOC_TYPE_LABELS,
  FIELD_LABELS,
  MIN_DOC_TYPE_CONFIDENCE,
  YES_THRESHOLD,
  type DocType,
  type FieldKey,
  type InvoiceAnswers,
} from "./invoice-questions";
import type { RegistrationNumber } from "./registration-number";

export const CATEGORY_LABELS = {
  invoice: "請求書",
  review: "要確認",
  not_invoice: "請求書以外",
  unreadable: "読取不可",
} as const;

export type Category = keyof typeof CATEGORY_LABELS;

export type Verdict = {
  category: Category;
  /** jev が判定した書類の種類。読取不可のときは null */
  docType: DocType | null;
  reasons: string[];
};

/** OCR 結果がこれより短ければ、jev に送らず読取不可とする */
export const MIN_OCR_CHARS = 30;

export function unreadableVerdict(reason: string): Verdict {
  return { category: "unreadable", docType: null, reasons: [reason] };
}

export function decideVerdict(
  answers: InvoiceAnswers,
  registrationNumbers: RegistrationNumber[],
): Verdict {
  const { docType } = answers;
  const lowConfidence = answers.docTypeConfidence < MIN_DOC_TYPE_CONFIDENCE;
  const percent = Math.round(answers.docTypeConfidence * 100);

  if (docType !== "invoice") {
    if (lowConfidence) {
      return {
        category: "review",
        docType,
        reasons: [
          `書類の種類を「${DOC_TYPE_LABELS[docType]}」と判定しましたが、確信度が低い（${percent}%）`,
        ],
      };
    }
    return {
      category: "not_invoice",
      docType,
      reasons: [`書類の種類は「${DOC_TYPE_LABELS[docType]}」（確信度 ${percent}%）`],
    };
  }

  const reasons: string[] = [];

  if (lowConfidence) {
    reasons.push(`請求書と判定しましたが、確信度が低い（${percent}%）`);
  }

  if (registrationNumbers.length === 0) {
    reasons.push(
      answers.hasRegistrationNumber >= YES_THRESHOLD
        ? "登録番号がありそうだと jev は判定しましたが、T＋13桁の文字列としては読み取れていません（OCR の読み違いの可能性）"
        : "登録番号（T＋13桁）が見つかりません",
    );
  } else if (!registrationNumbers.some((n) => n.checkDigitValid)) {
    reasons.push(
      `登録番号 ${registrationNumbers.map((n) => n.value).join("、")} が法人番号のチェックデジットに合いません（OCR の読み違いの可能性）`,
    );
  }

  for (const key of Object.keys(FIELD_LABELS) as FieldKey[]) {
    if (answers.fields[key] < YES_THRESHOLD) {
      reasons.push(`${FIELD_LABELS[key]}が見当たりません`);
    }
  }

  if (answers.isTruncated >= YES_THRESHOLD) {
    reasons.push("内容が途中で切れている可能性があります（スキャンの欠け）");
  }

  if (reasons.length > 0) {
    return { category: "review", docType, reasons };
  }
  return {
    category: "invoice",
    docType,
    reasons: ["請求書と判定し、登録番号と必須項目を確認できました"],
  };
}
