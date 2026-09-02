"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PARTNER_STATUSES, PARTNER_STATUS_LABELS } from "@/lib/labels";
import { Button, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
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
      <Field label="Название" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={initial?.name ?? ""} autoComplete="organization" required />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Статус" htmlFor="status">
          <Select id="status" name="status" defaultValue={initial?.status ?? "ACTIVE"}>
            {PARTNER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PARTNER_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Категория" htmlFor="category">
          <Input id="category" name="category" defaultValue={initial?.category ?? ""} />
        </Field>
      </div>

      <Field label="Тип скидки / условие" htmlFor="discountType">
        <Input id="discountType" name="discountType" defaultValue={initial?.discountType ?? ""} />
      </Field>

      <Field label="Условия (подробно)" htmlFor="terms">
        <Textarea id="terms" name="terms" defaultValue={initial?.terms ?? ""} rows={2} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Контактное лицо" htmlFor="contactPerson">
          <Input id="contactPerson" name="contactPerson" defaultValue={initial?.contactPerson ?? ""} autoComplete="off" />
        </Field>
        <Field label="Контакты" htmlFor="contacts">
          <Input id="contacts" name="contacts" defaultValue={initial?.contacts ?? ""} autoComplete="off" placeholder="телефон, email, Telegram…" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Договор с" htmlFor="contractStart">
          <Input id="contractStart" type="date" name="contractStart" defaultValue={d(initial?.contractStart ?? null)} />
        </Field>
        <Field label="Договор по" htmlFor="contractEnd">
          <Input id="contractEnd" type="date" name="contractEnd" defaultValue={d(initial?.contractEnd ?? null)} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Ответственный (Фаровон)" htmlFor="responsible">
          <Input id="responsible" name="responsible" defaultValue={initial?.responsible ?? ""} autoComplete="off" />
        </Field>
        <Field label="Логотип (URL)" htmlFor="logoUrl">
          <Input id="logoUrl" name="logoUrl" defaultValue={initial?.logoUrl ?? ""} inputMode="url" />
        </Field>
      </div>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        <Link href="/admin/partners" className={buttonClass({ variant: "secondary" })}>
          Отмена
        </Link>
      </div>
    </form>
  );
}
