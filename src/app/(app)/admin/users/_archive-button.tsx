"use client";

import { useState, useTransition } from "react";
import { Button, ConfirmDialog } from "@/components/ui";
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
  const [confirming, setConfirming] = useState(false);

  function toggle() {
    setErr(null);
    start(async () => {
      const r = await setEmployeeArchived(id, !archived);
      if (r?.error) setErr(r.error);
      setConfirming(false);
    });
  }

  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant={archived ? "success" : "secondary"}
        size={size}
        disabled={pending}
        onClick={() => (archived ? toggle() : setConfirming(true))}
      >
        {archived ? "Вернуть из архива" : "В архив"}
      </Button>
      {confirming && (
        <ConfirmDialog
          title="В архив?"
          message="Сотрудник исчезнет из основного списка, вход будет закрыт."
          confirmLabel="В архив"
          pending={pending}
          onConfirm={toggle}
          onCancel={() => setConfirming(false)}
        />
      )}
      {err && (
        <span className="mt-1 text-[11px] font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
