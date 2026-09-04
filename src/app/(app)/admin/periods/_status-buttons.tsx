"use client";

import { useState, useTransition } from "react";
import { Button, ConfirmDialog } from "@/components/ui";
import { setPeriodStatus, deletePeriod } from "./actions";

type Confirm = { title: string; message: string; confirmLabel: string; danger?: boolean; run: () => Promise<{ error?: string }> };

export function PeriodActions({
  id,
  status,
  name,
}: {
  id: string;
  status: string;
  name: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      try {
        const r = await fn();
        if (r?.error) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setConfirm(null);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {status === "DRAFT" && (
          <Button
            variant="success"
            size="sm"
            disabled={pending}
            onClick={() => run(() => setPeriodStatus(id, "OPEN"))}
          >
            Открыть
          </Button>
        )}
        {status === "OPEN" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              setConfirm({
                title: "Закрыть период?",
                message: `Период «${name}»: подача и изменение заявок станут недоступны.`,
                confirmLabel: "Закрыть",
                run: () => setPeriodStatus(id, "CLOSED"),
              })
            }
          >
            Закрыть
          </Button>
        )}
        {status === "DRAFT" && (
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() =>
              setConfirm({
                title: "Удалить период?",
                message: `«${name}» будет удалён безвозвратно.`,
                confirmLabel: "Удалить",
                run: () => deletePeriod(id),
              })
            }
          >
            Удалить
          </Button>
        )}
      </div>
      {error && (
        <span className="max-w-[240px] text-right text-[11px] font-medium text-danger" role="alert">
          {error}
        </span>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          pending={pending}
          onConfirm={() => run(confirm.run)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
