"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cancelScheduledBroadcast } from "./actions";

/** Отмена отложенной рассылки — с подтверждением. */
export function CancelScheduledButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => setOpen(true)}>
        Отменить
      </Button>
      {error && (
        <span className="block text-xs text-danger" role="alert">
          {error}
        </span>
      )}
      <ConfirmDialog
        open={open}
        title="Отменить рассылку?"
        message={<>«{title}» не будет отправлена. Чтобы отправить позже, создайте её заново.</>}
        confirmLabel="Отменить рассылку"
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          start(async () => setError((await cancelScheduledBroadcast(id)).error ?? null));
        }}
      />
    </>
  );
}
