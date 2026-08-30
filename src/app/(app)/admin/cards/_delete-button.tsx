"use client";

import { useState, useTransition } from "react";
import { deleteCard } from "./actions";

export function DeleteCardButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <button
        onClick={() => {
          if (!confirm(`Удалить карточку «${title}»?`)) return;
          setError(null);
          start(async () => {
            try {
              await deleteCard(id);
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
      {error && <span className="mt-1 max-w-[220px] text-right text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
