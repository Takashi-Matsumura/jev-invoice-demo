"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { ClassifyEvent } from "@/lib/events";
import { CATEGORY_LABELS, type Category } from "@/lib/verdict";
import { DetailDialog } from "./detail-dialog";
import { Eta } from "./eta";
import { ItemCard } from "./item-card";
import { CATEGORY_STYLES, reducer } from "./items";
import { Stats } from "./stats";

async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ClassifyEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as ClassifyEvent);
    }
  }
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function Classifier() {
  const [items, dispatch] = useReducer(reducer, []);
  const [dragging, setDragging] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const queue = useRef<{ id: string; file: File }[]>([]);
  const running = useRef(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // 処理中のカードを見える位置まで送る。全件終わったら、最後に終わったカードを結果ごと見せる
  const followed =
    items.find((item) => item.phase === "running") ??
    [...items].reverse().find((item) => item.phase === "done" || item.phase === "error");
  const followedId = followed?.id;
  const followedPhase = followed?.phase;
  useEffect(() => {
    if (!autoScroll || !followedId) return;
    document.getElementById(`item-${followedId}`)?.scrollIntoView({ block: "nearest" });
  }, [autoScroll, followedId, followedPhase]);

  async function classify(id: string, file: File, signal: AbortSignal) {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/classify", { method: "POST", body, signal });
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? `サーバがエラーを返しました (${res.status})`);
    }

    let finished = false;
    await readNdjson(res.body, (event) => {
      if (event.type === "result" || event.type === "error") finished = true;
      dispatch({ type: "event", id, event, at: Date.now() });
    });
    if (!finished) throw new Error("応答が途中で切れました");
  }

  // 1 件ずつ順に送る。結果が 1 件ずつ確定していくので、終わったものから人が確認を始められる
  async function pump() {
    if (running.current) return;
    running.current = true;
    const controller = new AbortController();
    abort.current = controller;

    for (let next = queue.current.shift(); next; next = queue.current.shift()) {
      dispatch({ type: "start", id: next.id, startedAt: Date.now() });
      try {
        await classify(next.id, next.file, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) break;
        dispatch({
          type: "fail",
          id: next.id,
          // fetch は接続が切れると TypeError（"network error" など）を投げる
          message:
            error instanceof TypeError
              ? "サーバとの接続が途中で切れました（PC のスリープなどで起こります）"
              : error instanceof Error
                ? error.message
                : String(error),
        });
      }
    }
    running.current = false;
  }

  function addFiles(files: FileList | null) {
    const pdfs = [...(files ?? [])].filter(isPdf);
    if (pdfs.length === 0) return;
    const added = pdfs.map((file) => ({ id: crypto.randomUUID(), file }));
    queue.current.push(...added);
    dispatch({ type: "add", items: added.map(({ id, file }) => ({ id, name: file.name })) });
    void pump();
  }

  const busy = items.some((item) => item.phase === "queued" || item.phase === "running");

  // 処理中は画面を点けたままにして、放置によるスリープで接続が切れるのを防ぐ。
  // ロックはタブが隠れると外れるので、見える状態に戻ったら取り直す
  useEffect(() => {
    if (!busy || !("wakeLock" in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () => {
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (released) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lock?.release();
    };
  }, [busy]);

  const finishedCount = items.filter((item) => item.phase === "done" || item.phase === "error").length;
  const detailItem = items.find((item) => item.id === detailId);

  return (
    // 行の高さを minmax(0,1fr) で親に合わせないと、列が中身の高さまで伸びて内側でスクロールしない
    <div className="flex flex-col gap-4 md:grid md:min-h-0 md:flex-1 md:grid-cols-[20rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 md:min-h-0 md:overflow-y-auto md:pr-1">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragging
              ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-800"
              : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-500"
          }`}
        >
          <span className="font-medium">PDF をドロップ、またはクリック</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            複数選択できます。1 件ずつ順に処理します
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        <ul className="grid grid-cols-2 gap-2 text-sm">
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => (
            <li
              key={category}
              className={`flex items-baseline justify-between rounded-lg px-3 py-2 ${CATEGORY_STYLES[category]}`}
            >
              {CATEGORY_LABELS[category]}
              <span className="text-xl font-semibold tabular-nums">
                {items.filter((item) => item.verdict?.category === category).length}
              </span>
            </li>
          ))}
        </ul>

        <Stats items={items} />
      </aside>

      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <h2 className="font-semibold">PDF の処理状況</h2>
          <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
            {finishedCount} / {items.length} 件 完了
          </span>
          {busy && <Eta items={items} />}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            処理中を自動で追う
          </label>
          <button
            type="button"
            disabled={busy || items.length === 0}
            onClick={() => dispatch({ type: "clear" })}
            className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            クリア
          </button>
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            PDF を入れると、ここに 1 件ずつ処理状況と結果が並びます
          </p>
        ) : (
          <ul className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1 md:pb-1">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} onOpenDetail={() => setDetailId(item.id)} />
            ))}
          </ul>
        )}
      </section>

      {detailItem && <DetailDialog item={detailItem} onClose={() => setDetailId(null)} />}
    </div>
  );
}
