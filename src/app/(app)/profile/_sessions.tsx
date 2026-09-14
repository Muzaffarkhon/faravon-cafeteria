"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { revokeOtherSessions } from "./actions";

export function RevokeSessionsButton({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-3 border-t border-line-subtle pt-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending || done}
        onClick={() => setConfirming(true)}
      >
        {pending ? t("profile.finishing") : t("profile.logoutOtherDevices")}
      </Button>
      {done && (
        <span className="text-xs font-medium text-success-strong">
          {t("profile.otherSessionsClosed")}
        </span>
      )}
      <ConfirmDialog
        open={confirming}
        title={t("profile.closeSessionsConfirmTitle")}
        message={t("profile.closeSessionsConfirmMessage")}
        confirmLabel={t("profile.finish")}
        busy={pending}
        onConfirm={() => {
          start(async () => {
            await revokeOtherSessions();
            setDone(true);
            setConfirming(false);
          });
        }}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
