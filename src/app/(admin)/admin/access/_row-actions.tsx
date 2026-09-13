"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
  const [confirming, setConfirming] = useState(false);

  function doUnlink() {
    setError(null);
    start(async () => {
      try {
        const r = await unlinkTelegram(employeeId);
        if (r?.error) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setConfirming(false);
      }
    });
  }

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
          <Button variant="danger" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
            Сбросить Telegram
          </Button>
        )}
      </div>
      {error && (
        <span className="text-xs font-medium text-danger" role="alert">
          {error}
        </span>
      )}
      <ConfirmDialog
        open={confirming}
        title="Сбросить Telegram?"
        message="Привязка Telegram у сотрудника будет сброшена — потребуется код для повторной идентификации."
        confirmLabel="Сбросить"
        tone="danger"
        busy={pending}
        onConfirm={doUnlink}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
