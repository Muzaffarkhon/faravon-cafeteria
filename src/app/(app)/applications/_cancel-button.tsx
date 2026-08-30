"use client";

import { useState, useTransition } from "react";
import { cancelItem } from "../actions";

export function CancelItemButton({ itemId }: { itemId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <button
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
        disabled={pending}
        className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50"
      >
        Отменить
      </button>
      {err && <span className="mt-1 text-[11px] text-red-600">{err}</span>}
    </span>
  );
}
