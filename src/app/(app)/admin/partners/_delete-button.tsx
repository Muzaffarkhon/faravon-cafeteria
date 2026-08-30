"use client";

import { useState, useTransition } from "react";
import { deletePartner } from "./actions";

export function DeletePartnerButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <button
        onClick={() => {
          if (!confirm(`Удалить партнёра «${name}»?`)) return;
          setError(null);
          start(async () => {
            try {
              await deletePartner(id);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Ошибка");
            }
          });
        }}
        disabled={pending}
        className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Удалить
      </button>
      {error && <span className="mt-1 max-w-[200px] text-right text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
