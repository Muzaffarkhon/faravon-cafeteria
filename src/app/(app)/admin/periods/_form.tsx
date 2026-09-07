"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Field, Input, buttonClass } from "@/components/ui";
import type { PeriodFormState } from "./actions";

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
      <Field label="Название" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          defaultValue={initial?.name ?? ""}
          placeholder="Например: Сентябрь 2026"
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Начало периода" htmlFor="startDate" required>
          <Input id="startDate" type="date" name="startDate" defaultValue={d(initial?.startDate)} required />
        </Field>
        <Field label="Конец периода" htmlFor="endDate" required>
          <Input id="endDate" type="date" name="endDate" defaultValue={d(initial?.endDate)} required />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Окно выбора: с" htmlFor="windowStart" required>
          <Input id="windowStart" type="date" name="windowStart" defaultValue={d(initial?.windowStart)} required />
        </Field>
        <Field label="Окно выбора: по" htmlFor="windowEnd" required>
          <Input id="windowEnd" type="date" name="windowEnd" defaultValue={d(initial?.windowEnd)} required />
        </Field>
      </div>
      <p className="-mt-1 text-sm leading-6 text-ink-muted">
        Окно выбора обычно открывается в предыдущем месяце (до начала периода). Если сотрудник
        выберет льготу уже после старта периода, выбор автоматически перенесётся на следующий
        месяц.
      </p>

      <Field label="Лимит выбора льгот" htmlFor="maxSelections">
        <Input
          id="maxSelections"
          type="number"
          name="maxSelections"
          min={1}
          max={20}
          defaultValue={initial?.maxSelections ?? 4}
        />
      </Field>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        <Link href="/admin/periods" className={buttonClass({ variant: "secondary" })}>
          Отмена
        </Link>
      </div>
    </form>
  );
}
