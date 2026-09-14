"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Field, Input } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { submitAdvertisingRequest, type AdRequestState } from "./actions";

export function AdvertisingForm({ partnerName, locale }: { partnerName: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
      <Field label={t("advertising.form.partner")} htmlFor="company">
        <Input id="company" value={partnerName} readOnly className="bg-surface-muted" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("advertising.form.contactName")} htmlFor="contactName">
          <Input id="contactName" name="contactName" autoComplete="name" required />
        </Field>
        <Field label={t("advertising.form.contactPhone")} htmlFor="contactPhone">
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

      <Field label={t("advertising.form.productName")} htmlFor="productName">
        <Input id="productName" name="productName" required />
      </Field>

      <Field label={t("advertising.form.description")} htmlFor="productDescription" hint={t("advertising.form.descriptionHint")}>
        <textarea
          id="productDescription"
          name="productDescription"
          rows={4}
          required
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none control-focus"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t("advertising.form.androidLabel")}
          htmlFor="androidUrl"
          hint={t("advertising.form.androidHint")}
        >
          <Input id="androidUrl" name="androidUrl" type="url" inputMode="url" placeholder="https://play.google.com/store/apps/details?id=…" />
        </Field>
        <Field label={t("advertising.form.iosLabel")} htmlFor="iosUrl" hint={t("advertising.form.iosHint")}>
          <Input id="iosUrl" name="iosUrl" type="url" inputMode="url" placeholder="https://apps.apple.com/app/id…" />
        </Field>
      </div>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          {t("advertising.form.sent")}
        </p>
      )}

      <Button type="submit" loading={pending}>
        {t("advertising.form.submit")}
      </Button>
    </form>
  );
}
