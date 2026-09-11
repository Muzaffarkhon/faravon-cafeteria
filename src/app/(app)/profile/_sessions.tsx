"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { revokeOtherSessions } from "./actions";

export function RevokeSessionsButton() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-3 border-t border-line-subtle pt-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending || done}
        onClick={() => setConfirming(true)}
      >
        {pending ? "Завершение…" : "Выйти со всех других устройств"}
      </Button>
      {done && (
        <span className="text-xs font-medium text-success-strong">
          Другие сессии завершены.
        </span>
      )}
      <ConfirmDialog
        open={confirming}
        title="Завершить другие сессии?"
        message="Вход на всех других устройствах будет завершён немедленно."
        confirmLabel="Завершить"
        busy={pending}
        onConfirm={() => {
          start(async () => {
            await revokeOtherSessions();
            setDone(true);
            setConfirming(false);
          });
        }}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
