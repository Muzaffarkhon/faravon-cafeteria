"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
      <ConfirmDialog
        open={confirming}
        title="В архив?"
        message="Сотрудник исчезнет из основного списка, вход будет закрыт."
        confirmLabel="В архив"
        tone="danger"
        busy={pending}
        onConfirm={toggle}
        onClose={() => setConfirming(false)}
      />
      {err && (
        <span className="mt-1 text-xs font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
