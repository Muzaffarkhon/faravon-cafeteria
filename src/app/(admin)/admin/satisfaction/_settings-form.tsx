"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { saveSatisfactionSettings } from "./actions";

export function SatisfactionSettingsForm({
  enabled,
  repeatDays,
  locale,
}: {
  enabled: boolean;
  repeatDays: number;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState(saveSatisfactionSettings, {});

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
        />
        {t("satisfactionAdmin.enabledLabel")}
      </label>
      <p className="mt-1 text-xs text-ink-muted">{t("satisfactionAdmin.enabledHint")}</p>

      <div className="mt-4 max-w-[220px]">
        <Field label={t("satisfactionAdmin.repeatDaysLabel")} htmlFor="repeatDays" hint={t("satisfactionAdmin.repeatDaysHint")}>
          <Input id="repeatDays" name="repeatDays" type="number" min={1} max={365} defaultValue={repeatDays} required />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {t("satisfactionAdmin.save")}
        </Button>
        {state.ok && (
          <span className="text-sm font-medium text-success-strong" role="status">
            {t("satisfactionAdmin.saved")}
          </span>
        )}
        {state.error && (
          <span className="text-sm font-medium text-danger" role="alert">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
