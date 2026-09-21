"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { resetSandboxData } from "./actions";

export function ResetSandboxButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; ok?: boolean } | null>(null);

  function onConfirm() {
    start(async () => {
      const r = await resetSandboxData();
      setResult(r.error ? { error: r.error } : { ok: true });
      setOpen(false);
    });
  }

  return (
    <div className="space-y-3">
      <Button variant="danger" onClick={() => setOpen(true)} disabled={pending}>
        Очистить результаты тестов
      </Button>

      {result?.error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          Готово: заявки, купоны и кешбек удалены. Льготы, партнёры, периоды и сотрудники на месте.
        </p>
      )}

      <ConfirmDialog
        open={open}
        tone="danger"
        busy={pending}
        title="Очистить результаты тестов?"
        message="Удалятся все заявки, позиции, купоны и кешбек тестовой среды. Льготы, партнёры, периоды и сотрудники останутся — сценарий можно прогнать заново. Отменить нельзя."
        confirmLabel="Очистить"
        onConfirm={onConfirm}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
