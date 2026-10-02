import { formatMs, STEPS, timingsOf, type Item, type Timings } from "./items";

/** 判定まで終わった PDF を対象にした、ステップ別の処理時間。 */
export function Stats({ items }: { items: Item[] }) {
  const done = items.filter((item) => item.verdict);
  const pageCount = done.reduce((sum, item) => sum + item.pages.length, 0);
  const totals: Timings = { renderMs: 0, ocrMs: 0, locateMs: 0, registrationMs: 0, jevMs: 0 };
  for (const item of done) {
    const timings = timingsOf(item);
    for (const { key } of STEPS) totals[key] += timings[key];
  }
  const sum = STEPS.reduce((acc, { key }) => acc + totals[key], 0);
  const share = (key: keyof Timings) => (sum > 0 ? (totals[key] / sum) * 100 : 0);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-semibold">処理時間の内訳</h2>
      {done.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          1 件目の処理が終わると表示されます
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
            完了した PDF {done.length} 件・{pageCount} ページ・合計 {formatMs(sum)}
          </p>

          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            {STEPS.map(({ key, color }) => (
              <div key={key} className={color} style={{ width: `${share(key)}%` }} />
            ))}
          </div>

          <ul className="mt-3 flex flex-col divide-y divide-zinc-100 tabular-nums dark:divide-zinc-800">
            {STEPS.map(({ key, label, color }) => (
              <li key={key} className="py-2">
                <div className="flex items-baseline gap-2">
                  <span className={`inline-block size-2 shrink-0 rounded-full ${color}`} />
                  <span className="flex-1">{label}</span>
                  <span className="text-base font-semibold">{formatMs(totals[key])}</span>
                  <span className="w-14 text-right text-xs text-zinc-500 dark:text-zinc-400">
                    {share(key).toFixed(1)}%
                  </span>
                </div>
                <p className="mt-0.5 pl-4 text-xs text-zinc-500 dark:text-zinc-400">
                  {(key === "renderMs" || key === "ocrMs" || key === "locateMs") && pageCount > 0 && (
                    <>1 ページあたり {formatMs(totals[key] / pageCount)}・</>
                  )}
                  PDF 1 件あたり {formatMs(totals[key] / done.length)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
