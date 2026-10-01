import { Classifier } from "./classifier";

const STEPS = [
  { title: "PDF を画像化", external: false },
  { title: "AI-OCR で文字起こし", external: false },
  { title: "登録番号を検出", external: false },
  { title: "jev で書類を判定", external: true },
  { title: "分類を決定", external: false },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 md:h-dvh md:flex-none md:overflow-clip">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">請求書 PDF の仕分け</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            スキャンした PDF を、後続の処理に進む前に「請求書」「要確認」「請求書以外」「読取不可」に仕分けます。
          </p>
        </div>
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-zinc-400">→</span>}
              <span
                className={`rounded-md border px-2 py-1 ${
                  step.external
                    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                {i + 1}. {step.title}
                <span className="ml-1 opacity-60">{step.external ? "外部 API" : "この PC"}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-amber-800 dark:text-amber-200">
          PDF と画像はこの PC の外に出ません。文字起こししたテキストだけが、判定のために TypeSafe
          AI（jev）の API に送信されます。
        </p>
      </header>

      <Classifier />
    </main>
  );
}
