"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deletePartner } from "./actions";

export function DeletePartnerButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <span className="inline-flex flex-col items-end">
      <Button variant="danger" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        Удалить
      </Button>
      {error && (
        <span className="mt-1 max-w-[200px] text-right text-[11px] font-medium text-danger" role="alert">
          {error}
        </span>
      )}

      <ConfirmDialog
        open={open}
        title="Удалить партнёра?"
        message={<>«{name}» будет удалён безвозвратно.</>}
        confirmLabel="Удалить"
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
              setError(e instanceof Error ? e.message : "Ошибка");
            }
          });
        }}
        onClose={() => setOpen(false)}
      />
    </span>
  );
}
