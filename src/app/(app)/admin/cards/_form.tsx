"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BLOCKS, BLOCK_LABELS, CARD_STATUSES, CARD_STATUS_LABELS } from "@/lib/labels";
import { Button, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import type { CardFormState } from "./actions";

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Блок" htmlFor="block" required>
          <Select id="block" name="block" value={block} onChange={(e) => setBlock(e.target.value)}>
            {BLOCKS.map((b) => (
              <option key={b} value={b}>
                {BLOCK_LABELS[b]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Публикация" htmlFor="status">
          <Select id="status" name="status" defaultValue={initial?.status ?? "PUBLISHED"}>
            {CARD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CARD_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Название" htmlFor="title" required>
        <Input id="title" name="title" defaultValue={initial?.title ?? ""} required />
      </Field>

      <Field label="Описание" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} rows={2} />
      </Field>

      {block === "FLEX" && (
        <>
          <Field label="Условие / скидка" htmlFor="condition">
            <Input id="condition" name="condition" defaultValue={initial?.condition ?? ""} />
          </Field>
          <Field label="Партнёр" htmlFor="partnerId">
            <Select id="partnerId" name="partnerId" defaultValue={initial?.partnerId ?? ""}>
              <option value="">— не выбран —</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Категория" htmlFor="category">
          <Input id="category" name="category" defaultValue={initial?.category ?? ""} />
        </Field>
        <Field label="Порядок" htmlFor="sortOrder">
          <Input id="sortOrder" type="number" name="sortOrder" defaultValue={initial?.sortOrder ?? 0} />
        </Field>
      </div>

      <Field label="Изображение (URL)" htmlFor="imageUrl">
        <Input id="imageUrl" name="imageUrl" defaultValue={initial?.imageUrl ?? ""} inputMode="url" />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
        />
        Активна (без флага — отображается как «скоро»)
      </label>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохранение…" : submitLabel}
        </Button>
        <Link href="/admin/cards" className={buttonClass({ variant: "secondary" })}>
          Отмена
        </Link>
      </div>
    </form>
  );
}
