/**
 * ページ画像の上で、重要な項目が書かれている場所。
 *
 * 場所は vision LLM に答えさせる。ただし LLM は、そのページに無い項目の座標も作ってくる。
 * そこで「その場所に書かれている文字」も一緒に答えさせ、OCR テキストとルールで
 * 裏を取れたものだけを残す。
 */

import { FIELD_LABELS } from "./invoice-questions";
import { findRegistrationNumbers } from "./registration-number";

export const BOX_FIELD_LABELS = {
  total_amount: FIELD_LABELS.has_total_amount,
  issuer: FIELD_LABELS.has_issuer,
  billing_date: FIELD_LABELS.has_billing_date,
  registration_number: "登録番号",
} as const;

export type BoxField = keyof typeof BOX_FIELD_LABELS;

export type FieldBox = {
  field: BoxField;
  /** その場所に書かれている文字（LLM の答え） */
  text: string;
  /** 左上の位置と大きさ。ページ画像の幅・高さに対する割合（0〜1） */
  x: number;
  y: number;
  width: number;
  height: number;
};

export const LOCATE_PROMPT = `この画像の中で、次の項目の「値」が書かれている場所を示してください。
- total_amount: 請求金額の合計（例: 8,470円）
- issuer: この書類を発行した会社の名前
- billing_date: 発行日または請求年月
- registration_number: 適格請求書発行事業者の登録番号（T に続く 13 桁の数字）
このページに書かれていない項目は出力に含めないでください。推測で座標を作らないでください。
JSON の配列だけを出力してください。形式: [{"label": "項目名", "text": "その場所に書かれている文字", "bbox_2d": [x1, y1, x2, y2]}]
どの項目も無ければ [] を出力してください。`;

/** Qwen-VL 系は、画像の大きさによらず 0〜1000 の相対座標で答える */
const COORD_MAX = 1000;
/** 1 ページで囲む数の上限。LLM が同じ答えを繰り返し続けた場合の歯止め */
const MAX_BOXES_PER_PAGE = 12;

/** 表記ゆれ（全角・半角、空白の有無）を無視して比べるための正規化 */
const squash = (text: string) => text.normalize("NFKC").replace(/\s+/g, "");

/**
 * LLM の答えを読み、裏を取れた枠だけを返す。読めない答えは空配列にする。
 * pageText はそのページの OCR テキスト。
 */
export function parseFieldBoxes(answer: string, pageText: string): FieldBox[] {
  // ```json で囲んだり、前置きを付けたりすることがあるので、配列の部分だけを取り出す
  const start = answer.indexOf("[");
  const end = answer.lastIndexOf("]");
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const haystack = squash(pageText);
  const boxes: FieldBox[] = [];
  for (const entry of parsed) {
    const box = readBox(entry);
    if (box && isBackedByText(box, haystack)) boxes.push(box);
  }

  // 違う項目に同じ場所を答えているのは当て推量なので、どれも採らない
  const fieldsAt = new Map<string, Set<BoxField>>();
  for (const box of boxes) {
    const key = rectKey(box);
    fieldsAt.set(key, (fieldsAt.get(key) ?? new Set()).add(box.field));
  }
  const seen = new Set<string>();
  return boxes
    .filter((box) => {
      const key = rectKey(box);
      if (fieldsAt.get(key)!.size > 1 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_BOXES_PER_PAGE);
}

function readBox(entry: unknown): FieldBox | null {
  if (typeof entry !== "object" || entry === null) return null;
  const { label, text, bbox_2d: bbox } = entry as Record<string, unknown>;

  if (typeof label !== "string" || !Object.hasOwn(BOX_FIELD_LABELS, label)) return null;
  if (typeof text !== "string" || text.trim() === "") return null;
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  if (!bbox.every((n): n is number => typeof n === "number" && Number.isFinite(n))) return null;

  const [x1, y1, x2, y2] = bbox.map((n) => Math.min(Math.max(n, 0), COORD_MAX) / COORD_MAX);
  if (x2 <= x1 || y2 <= y1) return null;

  return {
    field: label as BoxField,
    text: text.trim(),
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function isBackedByText(box: FieldBox, haystack: string): boolean {
  const text = squash(box.text);
  // OCR で読めていない文字を答えているなら、場所も当てにならない
  if (!haystack.includes(text)) return false;

  switch (box.field) {
    case "registration_number":
      return findRegistrationNumbers(box.text).length > 0;
    case "total_amount":
    case "billing_date":
      return /\d/.test(text);
    case "issuer":
      return true;
  }
}

const rectKey = (box: FieldBox) => [box.x, box.y, box.width, box.height].join(",");
