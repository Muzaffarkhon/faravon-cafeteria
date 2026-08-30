"use client";

import { useState, useTransition } from "react";
import { createCoupon, issueCoupon } from "./actions";

function ActionButton({
  label,
  pendingLabel,
  onRun,
  variant,
}: {
  label: string;
  pendingLabel: string;
  onRun: () => Promise<void>;
  variant: "primary" | "issue";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cls =
    variant === "primary"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-green-600 hover:bg-green-700 text-white";

  return (
    <span className="inline-flex flex-col items-end">
      <button
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              await onRun();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Ошибка");
            }
          });
        }}
        disabled={pending}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${cls}`}
      >
        {pending ? pendingLabel : label}
      </button>
      {error && <span className="mt-1 text-[11px] text-red-600">{error}</span>}
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
      variant="issue"
      onRun={() => issueCoupon(couponId)}
    />
  );
}
