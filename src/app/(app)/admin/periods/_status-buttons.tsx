"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { setPeriodStatus, deletePeriod } from "./actions";

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

  function run(fn: () => Promise<{ error?: string }>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setError(null);
    start(async () => {
      try {
        const r = await fn();
        if (r?.error) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
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
              run(
                () => setPeriodStatus(id, "CLOSED"),
                `Закрыть период «${name}»? Подача и изменение заявок станут недоступны.`,
              )
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
            onClick={() => run(() => deletePeriod(id), `Удалить период «${name}»?`)}
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
    </div>
  );
}
