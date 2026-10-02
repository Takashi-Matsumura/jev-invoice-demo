"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PageResult } from "./items";
import { BoxedImage, BoxLegend } from "./page-image";

/** 倍率 1 は「表示欄の幅いっぱい」 */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.25;
/** ホイールの移動量あたりの拡大率 */
const WHEEL_ZOOM_SPEED = 0.01;
/** 1 回のホイールイベントで効かせる移動量の上限。マウスのホイールは 1 刻みが大きく、そのままだと跳びすぎる */
const MAX_WHEEL_DELTA = 25;
/** 表示欄の余白（p-3）。倍率を変えても伸びないので、スクロール位置の計算から除く */
const AREA_PADDING = 12;

const clampZoom = (zoom: number) => Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);

type Point = { x: number; y: number };

/**
 * ページ画像を目で確かめるための表示。ダイアログいっぱいに 1 ページを出し、
 * 拡大・縮小と、ドラッグでの移動ができる。
 */
export function PageViewer({
  pages,
  index,
  onIndexChange,
  onBack,
}: {
  pages: PageResult[];
  index: number;
  onIndexChange: (index: number) => void;
  onBack: () => void;
}) {
  const page = pages[index];
  const areaRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  /** 倍率を変えた直後に、注目していた点が動かないようにスクロール位置を直すための控え */
  const pendingScroll = useRef<{ ratio: number; anchor: Point } | null>(null);
  const dragStart = useRef<{ pointer: Point; scroll: Point } | null>(null);

  /** anchor は表示欄の左上からの位置。省略すると表示欄の中央を基準にする */
  const zoomTo = (next: number, anchor?: Point) => {
    const area = areaRef.current;
    const clamped = clampZoom(next);
    if (!area || clamped === zoom) return;
    pendingScroll.current = {
      ratio: clamped / zoom,
      anchor: anchor ?? { x: area.clientWidth / 2, y: area.clientHeight / 2 },
    };
    setZoom(clamped);
  };

  useLayoutEffect(() => {
    const area = areaRef.current;
    const pending = pendingScroll.current;
    if (!area || !pending) return;
    pendingScroll.current = null;
    const { ratio, anchor } = pending;
    area.scrollLeft = (area.scrollLeft + anchor.x - AREA_PADDING) * ratio - anchor.x + AREA_PADDING;
    area.scrollTop = (area.scrollTop + anchor.y - AREA_PADDING) * ratio - anchor.y + AREA_PADDING;
  }, [zoom]);

  // Ctrl / ⌘ ＋ホイール（トラックパッドのピンチ）で、ポインタの位置を中心に拡大・縮小する。
  // ブラウザ自体の拡大を止めるには preventDefault が要るので、passive でないリスナーを自分で付ける
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = area.getBoundingClientRect();
      const delta = Math.min(Math.max(event.deltaY, -MAX_WHEEL_DELTA), MAX_WHEEL_DELTA);
      zoomTo(zoom * Math.exp(-delta * WHEEL_ZOOM_SPEED), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  });

  const showPage = (next: number) => {
    onIndexChange(next);
    areaRef.current?.scrollTo(0, 0);
  };

  /** ページ全体が表示欄に収まる倍率にする */
  const fitWholePage = () => {
    const area = areaRef.current;
    const image = area?.querySelector("img");
    if (!area || !image || image.naturalWidth === 0) return;
    const widthToFitHeight = (area.clientHeight * image.naturalWidth) / image.naturalHeight;
    zoomTo(Math.min(1, widthToFitHeight / area.clientWidth));
  };

  const buttonClass =
    "rounded-md border border-zinc-300 px-2.5 py-1 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 px-5 py-2 dark:border-zinc-800">
        <button type="button" onClick={onBack} className={buttonClass}>
          ← 詳細に戻る
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => showPage(index - 1)}
            disabled={index === 0}
            className={buttonClass}
          >
            前のページ
          </button>
          <span className="tabular-nums">
            {page.page} / {pages.length} ページ
          </span>
          <button
            type="button"
            onClick={() => showPage(index + 1)}
            disabled={index === pages.length - 1}
            className={buttonClass}
          >
            次のページ
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => zoomTo(zoom / ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="縮小"
            className={buttonClass}
          >
            −
          </button>
          <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => zoomTo(zoom * ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="拡大"
            className={buttonClass}
          >
            ＋
          </button>
          <button type="button" onClick={() => zoomTo(1)} className={buttonClass}>
            幅に合わせる
          </button>
          <button type="button" onClick={fitWholePage} className={buttonClass}>
            ページ全体
          </button>
        </div>

        <BoxLegend page={page} />
      </div>

      <div
        ref={areaRef}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const area = event.currentTarget;
          area.setPointerCapture(event.pointerId);
          dragStart.current = {
            pointer: { x: event.clientX, y: event.clientY },
            scroll: { x: area.scrollLeft, y: area.scrollTop },
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = dragStart.current;
          if (!start) return;
          event.currentTarget.scrollLeft = start.scroll.x - (event.clientX - start.pointer.x);
          event.currentTarget.scrollTop = start.scroll.y - (event.clientY - start.pointer.y);
        }}
        onPointerUp={() => {
          dragStart.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          dragStart.current = null;
          setDragging(false);
        }}
        className={`min-h-0 flex-1 overflow-auto bg-zinc-100 p-3 dark:bg-zinc-950 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div className="mx-auto" style={{ width: `${zoom * 100}%` }}>
          <BoxedImage page={page} />
        </div>
      </div>

      <p className="border-t border-zinc-200 px-5 py-1.5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        ドラッグで移動、Ctrl / ⌘ ＋ホイール（トラックパッドはピンチ）で拡大・縮小できます。
      </p>
    </div>
  );
}
