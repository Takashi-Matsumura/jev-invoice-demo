/**
 * TypeSafe AI / jev (System One) の最小クライアント。
 * https://docs.typesafe.ai/api
 */

export const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const MODEL = "jev-latest";

const TIMEOUT_MS = 30_000;

export type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
};

export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

export type JevQuestion = NoulQuestion | ChoiceQuestion;

export type NoulAnswer = { type: "noul"; noul: number };

export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type JevAnswer = NoulAnswer | ChoiceAnswer;

export type JevResponse = {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
};

/**
 * 1 回のやり取りの記録。画面に出すため、送った内容もそのまま持つ。
 * クライアント側で組み立て直すと、表示用と実際に送った値がずれ得るため。
 */
export type JevExchange = {
  request: {
    endpoint: string;
    model: string;
    state: unknown;
    questions: Record<string, JevQuestion>;
  };
  response: JevResponse;
  /** サーバ側で計測した jev の応答時間（ミリ秒） */
  elapsedMs: number;
};

export class JevError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "JevError";
  }
}

/** state と型付き質問群を 1 回のコールで並列評価させる。 */
export async function askJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  signal?: AbortSignal,
): Promise<JevExchange> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    throw new JevError("TYPESAFE_API_KEY が設定されていません", 500);
  }

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const startedAt = performance.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, state, questions }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });

  if (!res.ok) {
    throw new JevError(
      `jev API が ${res.status} を返しました: ${await res.text()}`,
      res.status,
    );
  }

  return {
    request: { endpoint: ENDPOINT, model: MODEL, state, questions },
    response: (await res.json()) as JevResponse,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}
