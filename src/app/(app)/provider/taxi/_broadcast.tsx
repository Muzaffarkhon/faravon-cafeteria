"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { sendTaxiPromo, type TaxiPromoState } from "./actions";

export function PromoBroadcast({ recipients }: { recipients: number }) {
  const [state, formAction, pending] = useActionState<TaxiPromoState, FormData>(sendTaxiPromo, {});

  return (
    <form action={formAction} className="space-y-3">
      <Field
        label="Промокод"
        htmlFor="promo"
        hint={`Уйдёт в Telegram ${recipients} сотруднику(ам) моноширинным текстом — удобно копировать.`}
      >
        <Input id="promo" name="promo" required autoComplete="off" placeholder="напр. FRV-TAXI-2026" />
      </Field>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.sent != null && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          Промокод отправлен: {state.sent} получатель(ей).
        </p>
      )}

      <Button type="submit" loading={pending} disabled={recipients === 0}>
        Отправить всем одобренным
      </Button>
    </form>
  );
}
