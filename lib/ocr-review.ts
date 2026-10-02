/**
 * OCR の読み落としの見直し。
 *
 * vision LLM にページ全体を一度に書き起こさせると、小さな文字のかたまり（発行元の住所、
 * 発行日、問い合わせ先など）を行ごと飛ばすことがある。画像を細かくしても安定して直らなかった
 * ので、書き起こしの直後に、同じ会話で「漏れている文字だけ」を答えさせる。
 *
 * LLM は漏れを出し終えると、書き起こし済みの本文をそのまま繰り返し始めることがある。
 * 繰り返しはここのルールで捨て、続くようなら生成を打ち切る。
 */

export const REVIEW_PROMPT = `画像をもう一度見て、上の書き起こしから漏れている文字を探してください。小さな文字のかたまり、右上や右下の欄、表の中、枠で囲まれた部分は特に漏れやすいです。
漏れている文字だけを書き起こしてください。すでに書き起こした行は繰り返さないでください。説明文や前置きは付けないでください。
漏れが無ければ「なし」とだけ出力してください。`;

/** 書き起こし済みの行がこの数だけ続いたら、繰り返しに入ったとみて打ち切る */
const MAX_REPEATED_LINES = 3;

/** 表記ゆれ（全角・半角、空白の有無）を無視して比べるための正規化 */
const squash = (text: string) => text.normalize("NFKC").replace(/\s+/g, "");

const NOTHING_MISSED = /^なし[。.]?$/;

/** 見直しの答えから、書き起こしに無かった行だけを取り出す。 */
export function pickMissedLines(answer: string, ocrText: string): string[] {
  const seen = squash(ocrText);
  const picked = new Set<string>();
  const lines: string[] = [];
  for (const line of answer.split("\n")) {
    const key = squash(line);
    if (key === "" || NOTHING_MISSED.test(key)) continue;
    if (seen.includes(key) || picked.has(key)) continue;
    picked.add(key);
    lines.push(line.trim());
  }
  return lines;
}

/**
 * 生成の途中で呼び、打ち切るべきかを返す。
 * 最後の行はまだ書きかけなので見ない。
 */
export function isRepeatingTranscript(partialAnswer: string, ocrText: string): boolean {
  const seen = squash(ocrText);
  const finished = partialAnswer
    .split("\n")
    .slice(0, -1)
    .map(squash)
    .filter((line) => line !== "");
  if (finished.length < MAX_REPEATED_LINES) return false;
  return finished.slice(-MAX_REPEATED_LINES).every((line) => seen.includes(line));
}
