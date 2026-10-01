/** /api/classify が NDJSON（1 行 1 イベント）で返すイベント。 */

import type { JevExchange } from "./jev";
import type { RegistrationNumber } from "./registration-number";
import type { Verdict } from "./verdict";

export type ClassifyEvent =
  /** processedPages は実際に読むページ数（上限で打ち切ることがある） */
  | { type: "meta"; pageCount: number; processedPages: number }
  | { type: "status"; message: string }
  | { type: "page"; page: number; text: string; image: string; renderMs: number; ocrMs: number }
  | { type: "checks"; registrationNumbers: RegistrationNumber[]; elapsedMs: number }
  | { type: "jev"; exchange: JevExchange }
  | { type: "result"; verdict: Verdict; elapsedMs: number }
  | { type: "error"; message: string };
