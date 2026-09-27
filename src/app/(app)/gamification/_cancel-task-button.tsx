"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { cancelTaskAction } from "./_actions";

export function CancelTaskButton({ employeeTaskId, taskTitle, locale }: { employeeTaskId: string; taskTitle: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleCancel = () => {
    setError(null);
    start(async () => {
      const r = await cancelTaskAction(employeeTaskId);
      if (r?.error) setError(r.error);
      else setOpen(false);
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
        {t("gamification.cancelTask")}
      </Button>

      <ConfirmDialog
        open={open}
        title={t("gamification.cancelTaskConfirmTitle")}
        tone="danger"
        confirmLabel={t("gamification.cancelTask")}
        busy={pending}
        message={
          <div className="space-y-2">
            <p>
              {t("gamification.cancelTaskConfirmMessage")} <strong className="text-ink">«{taskTitle}»</strong>?
            </p>
            <p className="text-xs text-ink-subtle">{t("gamification.cancelTaskHint")}</p>
            {error && (
              <p className="rounded-md bg-danger/10 p-2 text-xs font-medium text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        }
        onConfirm={handleCancel}
        onClose={() => !pending && setOpen(false)}
      />
    </>
  );
}
