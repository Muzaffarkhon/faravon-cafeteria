"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { createCoupon, issueCoupon, deleteCoupon } from "./actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

function ActionButton({
  label,
  pendingLabel,
  onRun,
  variant,
}: {
  label: string;
  pendingLabel: string;
  onRun: () => Promise<{ error?: string; notice?: string }>;
  variant: "primary" | "success";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant={variant}
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          setNotice(null);
          start(async () => {
            try {
              const r = await onRun();
              if (r?.error) setError(r.error);
              else if (r?.notice) setNotice(r.notice);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Ошибка");
            }
          });
        }}
      >
        {pending ? pendingLabel : label}
      </Button>
      {error && (
        <span className="mt-1 text-xs font-medium text-danger" role="alert">
          {error}
        </span>
      )}
      {notice && !error && (
        <span className="mt-1 max-w-[16rem] text-right text-xs text-ink-muted" role="status">
          {notice}
        </span>
      )}
    </span>
  );
}

export function CreateCouponButton({ itemId }: { itemId: string }) {
  return (
    <ActionButton
      label="Сформировать купон"
      pendingLabel="Формирование…"
      variant="primary"
      onRun={() => createCoupon(itemId)}
    />
  );
}

export function IssueCouponButton({ couponId }: { couponId: string }) {
  return (
    <ActionButton
      label="Выдать"
      pendingLabel="Выдача…"
      variant="success"
      onRun={() => issueCoupon(couponId)}
    />
  );
}

export function DeleteCouponButton({
  couponId,
  couponNumber,
}: {
  couponId: string;
  couponNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    start(async () => {
      try {
        const r = await deleteCoupon(couponId);
        if (r?.error) {
          setError(r.error);
        } else {
          setOpen(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка удаления купона");
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setOpen(true)}
        className="text-danger hover:bg-danger/10 hover:text-danger"
      >
        Удалить
      </Button>

      <ConfirmDialog
        open={open}
        title="Удалить купон?"
        tone="danger"
        confirmLabel="Удалить"
        busy={pending}
        message={
          <div className="space-y-2">
            <p>
              Вы уверены, что хотите безвозвратно удалить купон{" "}
              <strong className="font-mono text-ink">№ {couponNumber}</strong>?
            </p>
            <p className="text-xs text-ink-subtle">
              Связанная позиция заявки сотрудника вернётся в статус «Одобрено» и появится в списке ожидающих формирования купона.
            </p>
            {error && (
              <p className="rounded-md bg-danger/10 p-2 text-xs font-medium text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        }
        onConfirm={handleDelete}
        onClose={() => !pending && setOpen(false)}
      />
    </>
  );
}
