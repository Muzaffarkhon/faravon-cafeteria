"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { PeriodFormState } from "./actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500";

export type PeriodValues = {
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  windowStart: Date | string;
  windowEnd: Date | string;
  maxSelections: number;
};

function d(v: Date | string | undefined) {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

export function PeriodForm({
  action,
  initial,
  submitLabel,
}: {
  action: (s: PeriodFormState, fd: FormData) => Promise<PeriodFormState>;
  initial?: Partial<PeriodValues>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700">Название *</label>
        <input
          name="name"
          defaultValue={initial?.name ?? ""}
          placeholder="Например: Сентябрь 2026"
          className={inputCls}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Начало периода *</label>
          <input type="date" name="startDate" defaultValue={d(initial?.startDate)} className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Конец периода *</label>
          <input type="date" name="endDate" defaultValue={d(initial?.endDate)} className={inputCls} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Окно выбора: с *</label>
          <input type="date" name="windowStart" defaultValue={d(initial?.windowStart)} className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Окно выбора: по *</label>
          <input type="date" name="windowEnd" defaultValue={d(initial?.windowEnd)} className={inputCls} required />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Лимит выбора льгот</label>
        <input
          type="number"
          name="maxSelections"
          min={1}
          max={20}
          defaultValue={initial?.maxSelections ?? 4}
          className={inputCls}
        />
      </div>

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
          href="/admin/periods"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
