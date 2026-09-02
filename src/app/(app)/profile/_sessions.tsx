"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { revokeOtherSessions } from "./actions";

export function RevokeSessionsButton() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <div className="flex items-center gap-3 border-t border-line-subtle pt-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending || done}
        onClick={() => {
          if (!confirm("Завершить вход на всех других устройствах?")) return;
          start(async () => {
            await revokeOtherSessions();
            setDone(true);
          });
        }}
      >
        {pending ? "Завершение…" : "Выйти со всех других устройств"}
      </Button>
      {done && (
        <span className="text-xs font-medium text-success-strong">
          Другие сессии завершены.
        </span>
      )}
    </div>
  );
}
