"use client";

import { useState, useTransition } from "react";
import { Button, ConfirmDialog } from "@/components/ui";
import { deletePartner } from "./actions";

export function DeletePartnerButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function run() {
    setError(null);
    start(async () => {
      try {
        const r = await deletePartner(id);
        if (r?.error) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setConfirming(false);
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end">
      <Button variant="danger" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
        Удалить
      </Button>
      {error && (
        <span className="mt-1 max-w-[200px] text-right text-[11px] font-medium text-danger" role="alert">
          {error}
        </span>
      )}
      {confirming && (
        <ConfirmDialog
          title="Удалить партнёра?"
          message={`«${name}» будет удалено безвозвратно.`}
          confirmLabel="Удалить"
          pending={pending}
          onConfirm={run}
          onCancel={() => setConfirming(false)}
        />
      )}
    </span>
  );
}
