"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { saveGamificationEnabled } from "./actions";

export function GamificationEnabledToggle({
  enabled,
  dailyBonusCoins,
  locale,
}: {
  enabled: boolean;
  dailyBonusCoins: number;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState(saveGamificationEnabled, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm">
      <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
        />
        {t("gamificationAdmin.enabledLabel")}
      </label>
      <span className="max-w-xs text-xs text-ink-muted">{t("gamificationAdmin.enabledHint")}</span>

      <Field label={t("gamificationAdmin.dailyBonusLabel")} htmlFor="dailyBonusCoins" hint={t("gamificationAdmin.dailyBonusHint")} className="w-40">
        <Input id="dailyBonusCoins" name="dailyBonusCoins" type="number" min={0} step={1} defaultValue={dailyBonusCoins} />
      </Field>

      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        {t("gamificationAdmin.save")}
      </Button>
      {state.ok && (
        <span className="text-sm font-medium text-success-strong" role="status">
          {t("gamificationAdmin.saved")}
        </span>
      )}
      {state.error && (
        <span className="text-sm font-medium text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
