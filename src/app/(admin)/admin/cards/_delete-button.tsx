"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { deleteCard } from "./actions";

export function DeleteCardButton({ id, title, locale }: { id: string; title: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <span className="inline-flex flex-col items-end">
      <Button variant="danger" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        {t("cards.delete")}
      </Button>
      {error && (
        <span className="mt-1 max-w-[220px] text-right text-xs font-medium text-danger" role="alert">
          {error}
        </span>
      )}

      <ConfirmDialog
        open={open}
        title={t("cards.deleteConfirmTitle")}
        message={<>«{title}» {t("cards.deleteConfirmMessage")}</>}
        confirmLabel={t("cards.delete")}
        tone="danger"
        busy={pending}
        onConfirm={() => {
          setError(null);
          start(async () => {
            try {
              const r = await deleteCard(id);
              if (r?.error) setError(r.error);
              else setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : t("cards.error"));
            }
          });
        }}
        onClose={() => setOpen(false)}
      />
    </span>
  );
}
