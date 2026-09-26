"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { saveGamificationEnabled } from "./actions";

export function GamificationEnabledToggle({ enabled, locale }: { enabled: boolean; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState(saveGamificationEnabled, {});

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
      <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
        />
        {t("gamificationAdmin.enabledLabel")}
      </label>
      <span className="text-xs text-ink-muted">{t("gamificationAdmin.enabledHint")}</span>
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
