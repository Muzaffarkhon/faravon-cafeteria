"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { setEmployeeArchived } from "./actions";

export function EmployeeArchiveButton({
  id,
  archived,
  size = "sm",
  locale,
}: {
  id: string;
  archived: boolean;
  size?: "sm" | "md";
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function toggle() {
    setErr(null);
    start(async () => {
      const r = await setEmployeeArchived(id, !archived);
      if (r?.error) setErr(r.error);
      setConfirming(false);
    });
  }

  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant={archived ? "success" : "secondary"}
        size={size}
        disabled={pending}
        onClick={() => (archived ? toggle() : setConfirming(true))}
      >
        {archived ? t("users.arch.returnFromArchive") : t("users.arch.toArchive")}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t("users.arch.confirmTitle")}
        message={t("users.arch.confirmMessage")}
        confirmLabel={t("users.arch.toArchive")}
        tone="danger"
        busy={pending}
        onConfirm={toggle}
        onClose={() => setConfirming(false)}
      />
      {err && (
        <span className="mt-1 text-xs font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
