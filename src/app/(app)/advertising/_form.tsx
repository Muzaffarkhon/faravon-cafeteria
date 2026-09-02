"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Field, Input } from "@/components/ui";
import { submitAdvertisingRequest, type AdRequestState } from "./actions";

export function AdvertisingForm({ partnerName }: { partnerName: string }) {
  const [state, formAction, pending] = useActionState<AdRequestState, FormData>(
    submitAdvertisingRequest,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="max-w-lg space-y-4">
      <Field label="Партнёр" htmlFor="company">
        <Input id="company" value={partnerName} readOnly className="bg-surface-muted" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Контактное лицо" htmlFor="contactName">
          <Input id="contactName" name="contactName" autoComplete="name" required />
        </Field>
        <Field label="Телефон" htmlFor="contactPhone">
          <Input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            inputMode="tel"
            placeholder="+992 900 000 000"
            required
          />
        </Field>
      </div>

      <Field label="Продукт / услуга" htmlFor="productName">
        <Input id="productName" name="productName" required />
      </Field>

      <Field label="Описание" htmlFor="productDescription" hint="Что рекламируем, какие условия для сотрудников.">
        <textarea
          id="productDescription"
          name="productDescription"
          rows={4}
          required
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none control-focus"
        />
      </Field>

      <Field label="Бюджет" htmlFor="budget" hint="Необязательно.">
        <Input id="budget" name="budget" placeholder="напр. до 5 000 сомони / мес" />
      </Field>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          Заявка отправлена. C&B рассмотрит её и свяжется с вами.
        </p>
      )}

      <Button type="submit" loading={pending}>
        Отправить заявку
      </Button>
    </form>
  );
}
