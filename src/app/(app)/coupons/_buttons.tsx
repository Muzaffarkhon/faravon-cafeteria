"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { createCoupon, issueCoupon } from "./actions";

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
