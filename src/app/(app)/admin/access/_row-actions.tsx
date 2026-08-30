"use client";

import { useState, useTransition } from "react";
import { issueCode, unlinkTelegram } from "./actions";

export function AccessRowActions({
  employeeId,
  linked,
}: {
  employeeId: string;
  linked: boolean;
}) {
  const [pending, start] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {code ? (
          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-mono text-xs text-emerald-800">
            Код: {code}
          </span>
        ) : (
          <button
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await issueCode(employeeId);
                if ("error" in r) setError(r.error);
                else setCode(r.code);
              });
            }}
            disabled={pending}
            className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50"
          >
            Выдать код
          </button>
        )}
        {linked && (
          <button
            onClick={() => {
              if (!confirm("Сбросить привязку Telegram у сотрудника?")) return;
              setError(null);
              start(async () => {
                try {
                  await unlinkTelegram(employeeId);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Ошибка");
                }
              });
            }}
            disabled={pending}
            className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Сбросить Telegram
          </button>
        )}
      </div>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
