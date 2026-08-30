"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PARTNER_STATUSES, PARTNER_STATUS_LABELS } from "@/lib/labels";
import type { PartnerFormState } from "./actions";

export type PartnerValues = {
  name: string;
  status: string;
  category: string | null;
  contactPerson: string | null;
  contacts: string | null;
  discountType: string | null;
  terms: string | null;
  responsible: string | null;
  logoUrl: string | null;
  contractStart: Date | string | null;
  contractEnd: Date | string | null;
};

const inputCls =
  "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500";

function d(v: Date | string | null) {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

export function PartnerForm({
  action,
  initial,
  submitLabel,
}: {
  action: (s: PartnerFormState, fd: FormData) => Promise<PartnerFormState>;
  initial?: Partial<PartnerValues>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700">Название *</label>
        <input name="name" defaultValue={initial?.name ?? ""} className={inputCls} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Статус</label>
          <select name="status" defaultValue={initial?.status ?? "ACTIVE"} className={inputCls}>
            {PARTNER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PARTNER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Категория</label>
          <input name="category" defaultValue={initial?.category ?? ""} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Тип скидки / условие</label>
        <input name="discountType" defaultValue={initial?.discountType ?? ""} className={inputCls} />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Условия (подробно)</label>
        <textarea name="terms" defaultValue={initial?.terms ?? ""} rows={2} className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Контактное лицо</label>
          <input name="contactPerson" defaultValue={initial?.contactPerson ?? ""} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Контакты</label>
          <input name="contacts" defaultValue={initial?.contacts ?? ""} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Договор с</label>
          <input type="date" name="contractStart" defaultValue={d(initial?.contractStart ?? null)} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Договор по</label>
          <input type="date" name="contractEnd" defaultValue={d(initial?.contractEnd ?? null)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Ответственный (Фаровон)</label>
          <input name="responsible" defaultValue={initial?.responsible ?? ""} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Логотип (URL)</label>
          <input name="logoUrl" defaultValue={initial?.logoUrl ?? ""} className={inputCls} />
        </div>
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
          href="/admin/partners"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
