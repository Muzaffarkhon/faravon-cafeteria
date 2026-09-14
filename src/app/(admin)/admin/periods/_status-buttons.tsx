"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { setPeriodStatus, deletePeriod, resetFlowData } from "./actions";

export function PeriodActions({
  id,
  status,
  name,
  locale,
}: {
  id: string;
  status: string;
  name: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  function execute(fn: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    setError(null);
    start(async () => {
      try {
        const r = await fn();
        if (r?.error) setError(r.error);
        else onSuccess?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("periods.error"));
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {status === "DRAFT" && (
          <Button
            variant="success"
            size="sm"
            disabled={pending}
            onClick={() => execute(() => setPeriodStatus(id, "OPEN"))}
          >
            {t("periods.open")}
          </Button>
        )}
        {status === "OPEN" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmClose(true)}
          >
            {t("periods.close")}
          </Button>
        )}
        {(status === "DRAFT" || status === "CLOSED") && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmDel(true)}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            {t("periods.delete")}
          </Button>
        )}
      </div>

      {error && (
        <span className="max-w-[240px] text-right text-xs font-medium text-danger" role="alert">
          {error}
        </span>
      )}

      <ConfirmDialog
        open={confirmClose}
        title={t("periods.closeConfirmTitle")}
        tone="primary"
        confirmLabel={t("periods.closePeriod")}
        busy={pending}
        message={`${t("periods.closeConfirmMessagePrefix")}${name}${t("periods.closeConfirmMessageSuffix")}`}
        onConfirm={() => execute(() => setPeriodStatus(id, "CLOSED"), () => setConfirmClose(false))}
        onClose={() => !pending && setConfirmClose(false)}
      />

      <ConfirmDialog
        open={confirmDel}
        title={t("periods.deleteConfirmTitle")}
        tone="danger"
        confirmLabel={t("periods.delete")}
        busy={pending}
        message={
          <div className="space-y-1.5">
            <p>{t("periods.deleteConfirmMessagePrefix")}<strong>{name}</strong>{t("periods.deleteConfirmMessageSuffix")}</p>
            <p className="text-xs text-ink-subtle">
              {t("periods.deleteConfirmHint")}
            </p>
          </div>
        }
        onConfirm={() => execute(() => deletePeriod(id), () => setConfirmDel(false))}
        onClose={() => !pending && setConfirmDel(false)}
      />
    </div>
  );
}

export function ResetFlowButton({ periodId, name, locale }: { periodId: string; name: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleReset = () => {
    setError(null);
    start(async () => {
      try {
        const r = await resetFlowData(periodId);
        if (r?.error) setError(r.error);
        else setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("periods.resetError"));
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setOpen(true)}
        className="text-danger hover:bg-danger/10 hover:text-danger"
      >
        {t("periods.clearTestData")}
      </Button>

      <ConfirmDialog
        open={open}
        title={t("periods.resetConfirmTitle")}
        tone="danger"
        confirmLabel={t("periods.resetConfirmLabel")}
        busy={pending}
        message={
          <div className="space-y-2">
            <p>
              {t("periods.resetConfirmMessagePrefix")}<strong>{name}</strong>{t("periods.resetConfirmMessageSuffix")}
            </p>
            <p className="text-xs text-ink-subtle">
              {t("periods.resetConfirmMessage2")}
            </p>
            {error && (
              <p className="rounded-md bg-danger/10 p-2 text-xs font-medium text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        }
        onConfirm={handleReset}
        onClose={() => !pending && setOpen(false)}
      />
    </>
  );
}

