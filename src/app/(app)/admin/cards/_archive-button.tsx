"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { setCardArchived } from "./actions";

export function CardArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant={archived ? "success" : "secondary"}
        size="sm"
        disabled={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            const r = await setCardArchived(id, !archived);
            if (r?.error) setErr(r.error);
          });
        }}
      >
        {archived ? "Вернуть из архива" : "В архив"}
      </Button>
      {err && (
        <span className="mt-1 text-[11px] font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
