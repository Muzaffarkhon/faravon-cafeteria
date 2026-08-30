"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BLOCKS, BLOCK_LABELS, CARD_STATUSES, CARD_STATUS_LABELS } from "@/lib/labels";
import type { CardFormState } from "./actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500";

export type CardValues = {
  block: string;
  title: string;
  status: string;
  description: string | null;
  condition: string | null;
  imageUrl: string | null;
  category: string | null;
  isActive: boolean;
  sortOrder: number;
  partnerId: string | null;
};

export function CardForm({
  action,
  partners,
  initial,
  submitLabel,
}: {
  action: (s: CardFormState, fd: FormData) => Promise<CardFormState>;
  partners: { id: string; name: string }[];
  initial?: Partial<CardValues>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [block, setBlock] = useState(initial?.block ?? "FLEX");

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Блок *</label>
          <select
            name="block"
            value={block}
            onChange={(e) => setBlock(e.target.value)}
            className={inputCls}
          >
            {BLOCKS.map((b) => (
              <option key={b} value={b}>
                {BLOCK_LABELS[b]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Публикация</label>
          <select name="status" defaultValue={initial?.status ?? "PUBLISHED"} className={inputCls}>
            {CARD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CARD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Название *</label>
        <input name="title" defaultValue={initial?.title ?? ""} className={inputCls} required />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Описание</label>
        <textarea name="description" defaultValue={initial?.description ?? ""} rows={2} className={inputCls} />
      </div>

      {block === "FLEX" && (
        <>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Условие / скидка</label>
            <input name="condition" defaultValue={initial?.condition ?? ""} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Партнёр</label>
            <select name="partnerId" defaultValue={initial?.partnerId ?? ""} className={inputCls}>
              <option value="">— не выбран —</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Категория</label>
          <input name="category" defaultValue={initial?.category ?? ""} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Порядок</label>
          <input
            type="number"
            name="sortOrder"
            defaultValue={initial?.sortOrder ?? 0}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Изображение (URL)</label>
        <input name="imageUrl" defaultValue={initial?.imageUrl ?? ""} className={inputCls} />
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Активна (без флага — отображается как «скоро»)
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "Сохранение…" : submitLabel}
        </button>
        <Link
          href="/admin/cards"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
