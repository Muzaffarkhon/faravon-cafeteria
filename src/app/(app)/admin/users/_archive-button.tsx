"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { setEmployeeArchived } from "./actions";

export function EmployeeArchiveButton({
  id,
  archived,
  size = "sm",
}: {
  id: string;
  archived: boolean;
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant={archived ? "success" : "secondary"}
        size={size}
        disabled={pending}
        onClick={() => {
          if (
            !archived &&
            !confirm("Отправить сотрудника в архив? Он исчезнет из основного списка, вход будет закрыт.")
          )
            return;
          setErr(null);
          start(async () => {
            const r = await setEmployeeArchived(id, !archived);
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
