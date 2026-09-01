"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
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
          <span className="rounded-md bg-success-soft px-2.5 py-1 font-mono text-xs text-success-strong">
            Код: {code}
          </span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await issueCode(employeeId);
                if ("error" in r) setError(r.error);
                else setCode(r.code);
              });
            }}
          >
            Выдать код
          </Button>
        )}
        {linked && (
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("Сбросить привязку Telegram у сотрудника?")) return;
              setError(null);
              start(async () => {
                try {
                  const r = await unlinkTelegram(employeeId);
                  if (r?.error) setError(r.error);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Ошибка");
                }
              });
            }}
          >
            Сбросить Telegram
          </Button>
        )}
      </div>
      {error && (
        <span className="text-[11px] font-medium text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
