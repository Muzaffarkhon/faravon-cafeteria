"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteBroadcast } from "./actions";

/** Удаление рассылки из истории — с подтверждением. `redirectTo` — куда уйти после удаления (со страницы рассылки). */
export function DeleteBroadcastButton({ id, title, redirectTo }: { id: string; title: string; redirectTo?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => setOpen(true)}>
        Удалить
      </Button>
      {error && (
        <span className="block text-xs text-danger" role="alert">
          {error}
        </span>
      )}
      <ConfirmDialog
        open={open}
        tone="danger"
        title="Удалить рассылку?"
        message={
          <>
            «{title}» исчезнет из истории вместе с ответами и статусом доставки. Сообщения, которые уже ушли сотрудникам
            в Telegram, у них останутся.
          </>
        }
        confirmLabel="Удалить"
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          start(async () => {
            const r = await deleteBroadcast(id);
            if (r.error) setError(r.error);
            else if (redirectTo) router.push(redirectTo);
          });
        }}
      />
    </>
  );
}
