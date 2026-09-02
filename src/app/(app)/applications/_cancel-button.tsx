"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { cancelItem } from "../actions";

export function CancelItemButton({ itemId }: { itemId: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    start(async () => {
      try {
        await cancelItem(itemId);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка");
        setConfirming(false);
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {confirming ? (
        <span className="inline-flex items-center gap-1.5">
          <Button variant="danger" size="sm" loading={pending} onClick={run}>
            Точно отменить
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
            Нет
          </Button>
        </span>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          Отменить
        </Button>
      )}
      {err && (
        <span className="text-[11px] font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
