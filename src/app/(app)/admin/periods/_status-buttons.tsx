"use client";

import { useState, useTransition } from "react";
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

  function run(fn: () => Promise<void>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {status === "DRAFT" && (
          <button
            onClick={() => run(() => setPeriodStatus(id, "OPEN"))}
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Открыть
          </button>
        )}
        {status === "OPEN" && (
          <button
            onClick={() => run(() => setPeriodStatus(id, "CLOSED"), `Закрыть период «${name}»? Подача и изменение заявок станут недоступны.`)}
            disabled={pending}
            className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Закрыть
          </button>
        )}
        {status === "DRAFT" && (
          <button
            onClick={() => run(() => deletePeriod(id), `Удалить период «${name}»?`)}
            disabled={pending}
            className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Удалить
          </button>
        )}
      </div>
      {error && <span className="max-w-[240px] text-right text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
