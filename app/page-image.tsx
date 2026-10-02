import { BOX_FIELD_LABELS, type BoxField } from "@/lib/field-boxes";
import type { PageResult } from "./items";

const BOX_FIELDS = Object.keys(BOX_FIELD_LABELS) as BoxField[];

/** 枠の色。スキャンした紙の上でも、画面の明暗によらず見分けられる濃さにしている */
const BOX_STYLES: Record<BoxField, { outline: string; fill: string }> = {
  total_amount: { outline: "outline-rose-600", fill: "bg-rose-600" },
  issuer: { outline: "outline-indigo-600", fill: "bg-indigo-600" },
  billing_date: { outline: "outline-amber-600", fill: "bg-amber-600" },
  registration_number: { outline: "outline-emerald-600", fill: "bg-emerald-600" },
};

/** 枠の色と項目名の対応。そのページで見つからなかった項目は取り消し線にする。 */
export function BoxLegend({ page }: { page: PageResult }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {BOX_FIELDS.map((field) => {
        const found = page.boxes.some((box) => box.field === field);
        return (
          <li
            key={field}
            className={found ? "" : "text-zinc-400 line-through dark:text-zinc-500"}
            title={found ? undefined : "このページでは見つかりませんでした"}
          >
            <span
              className={`mr-1 inline-block size-2 rounded-sm ${found ? BOX_STYLES[field].fill : "bg-zinc-300 dark:bg-zinc-600"}`}
            />
            {BOX_FIELD_LABELS[field]}
          </li>
        );
      })}
    </ul>
  );
}

/** ページ画像に、重要な項目を囲む枠を重ねる。幅は親に合わせる。 */
export function BoxedImage({ page }: { page: PageResult }) {
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL なので最適化の対象外 */}
      <img
        src={page.image}
        alt={`${page.page} ページ目`}
        draggable={false}
        className="block w-full rounded border border-zinc-200 select-none dark:border-zinc-700"
      />
      {page.boxes.map((box, i) => (
        <div
          key={i}
          title={`${BOX_FIELD_LABELS[box.field]}: ${box.text}`}
          className={`absolute rounded-sm outline-2 outline-offset-2 ${BOX_STYLES[box.field].outline}`}
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
