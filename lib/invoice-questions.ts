/**
 * jev に投げる質問と、その答えの読み方。
 *
 * jev は日本語の精度が英語より低いと公式に明記されているので、instructions は英語で書き、
 * criteria に実際の帳票に出てくる日本語の語句を入れている。criteria の書き方が精度に直結する。
 */

import type { JevAnswer, JevQuestion } from "./jev";

export const DOC_TYPE_LABELS = {
  invoice: "請求書",
  delivery_note: "納品書",
  receipt: "領収書",
  quotation: "見積書",
  other: "その他",
} as const;

export type DocType = keyof typeof DOC_TYPE_LABELS;

export const FIELD_LABELS = {
  has_total_amount: "請求金額の合計",
  has_issuer: "発行元の会社名",
  has_billing_date: "発行日または請求年月",
} as const;

export type FieldKey = keyof typeof FIELD_LABELS;

/** 画面表示用の質問名 */
export const QUESTION_LABELS: Record<string, string> = {
  doc_type: "書類の種類",
  ...FIELD_LABELS,
  has_registration_number: "登録番号（T＋13桁）",
  is_truncated: "内容が途切れているか",
};

export const QUESTIONS: Record<string, JevQuestion> = {
  doc_type: {
    type: "choice",
    instructions:
      "What kind of business document is this OCR text from? It was scanned from paper sent by a Japanese telephone or telecommunications company.",
    criteria: {
      invoice:
        "A bill that asks the recipient to pay charges. Typical wording: 請求書, ご請求書, ご請求金額, ご利用料金のご案内, 口座振替のご案内, ご利用料金内訳書.",
      delivery_note:
        "A delivery note listing goods or equipment that were shipped or handed over, without asking for payment. Typical wording: 納品書, 納品明細, お届け明細.",
      receipt:
        "A receipt confirming that payment was already received. Typical wording: 領収書, 領収証, 上記正に領収いたしました.",
      quotation:
        "A quotation or estimate issued before an order. Typical wording: 見積書, お見積り, 御見積書.",
      other:
        "Anything else (contract, notice, application form, advertisement), or text too fragmentary to tell.",
    } satisfies Record<DocType, string>,
  },
  has_total_amount: {
    type: "noul",
    instructions: "Does the document state the total amount being billed?",
    criteria: {
      true: "A total in yen appears next to wording such as ご請求金額, ご請求額, 合計, 請求金額合計.",
      false: "Only individual line items appear, or no amount appears at all.",
    },
  },
  has_issuer: {
    type: "noul",
    instructions: "Does the document name the company that issued it?",
    criteria: {
      true: "A company name of the issuer appears, for example a name containing 株式会社 such as a telephone company.",
      false: "No issuing company can be identified from the text.",
    },
  },
  has_billing_date: {
    type: "noul",
    instructions: "Does the document state its issue date or the billing month it covers?",
    criteria: {
      true: "A date or month appears with wording such as 発行日, ご請求年月, 年 月分, 月ご利用分, お支払期限.",
      false: "No issue date or billing period appears.",
    },
  },
  has_registration_number: {
    type: "noul",
    instructions:
      "Does the document show a Japanese qualified invoice issuer registration number?",
    criteria: {
      true: "The letter T followed by 13 digits appears, usually near 登録番号 or 適格請求書発行事業者登録番号.",
      false: "No such number appears. Telephone numbers, customer numbers and invoice numbers do not count.",
    },
  },
  is_truncated: {
    type: "noul",
    instructions:
      "Does this text look like part of the document is missing, for example because the page was cut off during scanning?",
    criteria: {
      true: "The text starts or ends in the middle of a table or sentence, a header or a total that this kind of document normally has is absent, or page numbers such as 1/3 show that pages are missing.",
      false: "The text reads as a complete document from its header to its end.",
    },
  },
};

/** noul をはい/いいえに倒す境目 */
export const YES_THRESHOLD = 0.5;
/** 書類の種類の確信度がこれ未満なら、人に確認してもらう */
export const MIN_DOC_TYPE_CONFIDENCE = 0.6;

export type InvoiceAnswers = {
  docType: DocType;
  docTypeConfidence: number;
  fields: Record<FieldKey, number>;
  hasRegistrationNumber: number;
  isTruncated: number;
};

/** jev の応答を型付きで読む。想定した形でなければ null。 */
export function readAnswers(answers: Record<string, JevAnswer>): InvoiceAnswers | null {
  const docType = answers.doc_type;
  if (docType?.type !== "choice" || !(docType.choice in DOC_TYPE_LABELS)) return null;

  const noul = (key: string) => {
    const answer = answers[key];
    return answer?.type === "noul" && typeof answer.noul === "number" ? answer.noul : null;
  };

  const total = noul("has_total_amount");
  const issuer = noul("has_issuer");
  const date = noul("has_billing_date");
  const registration = noul("has_registration_number");
  const truncated = noul("is_truncated");
  if (total === null || issuer === null || date === null || registration === null || truncated === null) {
    return null;
  }

  return {
    docType: docType.choice as DocType,
    docTypeConfidence: docType.confidence,
    fields: { has_total_amount: total, has_issuer: issuer, has_billing_date: date },
    hasRegistrationNumber: registration,
    isTruncated: truncated,
  };
}
