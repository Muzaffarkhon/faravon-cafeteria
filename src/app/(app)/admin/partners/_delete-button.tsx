"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { deletePartner } from "./actions";

export function DeletePartnerButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
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
      >
        Удалить
      </Button>
      {error && (
        <span className="mt-1 max-w-[200px] text-right text-[11px] font-medium text-danger" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
