"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { issueCode, unlinkTelegram } from "./actions";

export function AccessRowActions({
  employeeId,
  linked,
  locale,
}: {
  employeeId: string;
  linked: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function doUnlink() {
    setError(null);
    start(async () => {
      try {
        const r = await unlinkTelegram(employeeId);
        if (r?.error) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("access.error"));
      } finally {
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {code ? (
          <span className="rounded-md bg-success-soft px-2.5 py-1 font-mono text-xs text-success-strong">
            {t("access.codeLabel")} {code}
          </span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await issueCode(employeeId);
                if ("error" in r) setError(r.error);
                else setCode(r.code);
              });
            }}
          >
            {t("access.issueCode")}
          </Button>
        )}
        {linked && (
          <Button variant="danger" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
            {t("access.resetTelegram")}
          </Button>
        )}
      </div>
      {error && (
        <span className="text-xs font-medium text-danger" role="alert">
          {error}
        </span>
      )}
      <ConfirmDialog
        open={confirming}
        title={t("access.resetConfirmTitle")}
        message={t("access.resetConfirmMessage")}
        confirmLabel={t("access.reset2")}
        tone="danger"
        busy={pending}
        onConfirm={doUnlink}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
