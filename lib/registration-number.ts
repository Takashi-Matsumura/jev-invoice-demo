/**
 * 適格請求書発行事業者登録番号（T + 13 桁）を OCR テキストから拾う。
 *
 * ここは AI を使わない確定的な処理。法人の場合、13 桁は法人番号そのものなので
 * 先頭 1 桁のチェックデジットで読み違いを検出できる。
 */

export type RegistrationNumber = {
  /** 正規化済みの表記（例: T9011101031552） */
  value: string;
  /**
   * 法人番号のチェックデジットに合うか。
   * 合わない場合は OCR の読み違いか、法人番号を持たない個人事業者の番号。
   */
  checkDigitValid: boolean;
};

// 桁の間に空白やハイフンが挟まる表記（T 9011 1010 31552 など）も拾う。行はまたがない
const PATTERN = /(?<![A-Za-z0-9])T[ \t-]*((?:\d[ \t-]*){13})(?!\d)/g;

export function findRegistrationNumbers(text: string): RegistrationNumber[] {
  // NFKC で全角の英数字・ハイフンを半角にそろえる
  const normalized = text.normalize("NFKC");
  const found = new Map<string, RegistrationNumber>();

  for (const match of normalized.matchAll(PATTERN)) {
    const digits = match[1].replace(/\D/g, "");
    const value = `T${digits}`;
    if (!found.has(value)) {
      found.set(value, { value, checkDigitValid: isValidCorporateNumber(digits) });
    }
  }
  return [...found.values()];
}

/**
 * 法人番号（13 桁）のチェックデジット検証。
 * 先頭 1 桁 = 9 - (Σ Pi×Qi mod 9)。Pi は残り 12 桁を右から数えた i 桁目、
 * Qi は i が奇数なら 1、偶数なら 2。
 */
export function isValidCorporateNumber(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;

  const body = digits.slice(1);
  let sum = 0;
  for (let i = 1; i <= 12; i++) {
    const p = Number(body[12 - i]);
    sum += p * (i % 2 === 1 ? 1 : 2);
  }
  return Number(digits[0]) === 9 - (sum % 9);
}
