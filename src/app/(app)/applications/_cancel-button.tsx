"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { cancelItem } from "../actions";

export function CancelItemButton({ itemId }: { itemId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            try {
              await cancelItem(itemId);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Ошибка");
            }
          });
        }}
      >
        Отменить
      </Button>
      {err && (
        <span className="mt-1 text-[11px] font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
