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
    <form action={formAction} className="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-sm">
      <label className="flex items-start gap-2.5 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--primary)]"
        />
        <span>
          {t("gamificationAdmin.enabledLabel")}
          <span className="mt-1 block max-w-sm text-xs font-normal text-ink-muted">
            {t("gamificationAdmin.enabledHint")}
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-end gap-4 border-t border-line-subtle pt-4">
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
      </div>
    </form>
  );
}
