"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { deletePartner } from "./actions";

export function DeletePartnerButton({ id, name, locale }: { id: string; name: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <span className="inline-flex flex-col items-end">
      <Button variant="danger" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        {t("partners.delete")}
      </Button>
      {error && (
        <span className="mt-1 max-w-[200px] text-right text-[11px] font-medium text-danger" role="alert">
          {error}
        </span>
      )}

      <ConfirmDialog
        open={open}
        title={t("partners.deleteConfirmTitle")}
        message={<>«{name}» {t("partners.deleteConfirmMessage")}</>}
        confirmLabel={t("partners.delete")}
        tone="danger"
        busy={pending}
        onConfirm={() => {
          setError(null);
          start(async () => {
            try {
              const r = await deletePartner(id);
              if (r?.error) setError(r.error);
              else setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : t("partners.error"));
            }
          });
        }}
        onClose={() => setOpen(false)}
      />
    </span>
  );
}
