"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { sendTaxiPromo, type TaxiPromoState } from "./actions";

export function PromoBroadcast({ recipients, locale }: { recipients: number; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState<TaxiPromoState, FormData>(sendTaxiPromo, {});

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("providerTaxi.promoLabel")} htmlFor="promo" className="min-w-56 flex-1">
          <Input id="promo" name="promo" required autoComplete="off" placeholder={t("providerTaxi.promoPlaceholder")} />
        </Field>
        <Button type="submit" loading={pending} disabled={recipients === 0}>
          {t("providerTaxi.sendToAll")}
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        {t("providerTaxi.promoHintPrefix")} {recipients} {t("providerTaxi.promoHintSuffix")}
      </p>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.sent != null && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          {t("providerTaxi.sentPrefix")} {state.sent} {t("providerTaxi.sentSuffix")}
        </p>
      )}
    </form>
  );
}
