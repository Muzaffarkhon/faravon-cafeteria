"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { createCoupon, issueCoupon, deleteCoupon, rejectAwaitingItem } from "./actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

function ActionButton({
  label,
  pendingLabel,
  onRun,
  variant,
  errorFallback,
}: {
  label: string;
  pendingLabel: string;
  onRun: () => Promise<{ error?: string; notice?: string }>;
  variant: "primary" | "success";
  errorFallback: string;
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
              setError(e instanceof Error ? e.message : errorFallback);
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

export function CreateCouponButton({ itemId, locale }: { itemId: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <ActionButton
      label={t("coupons.create")}
      pendingLabel={t("coupons.creating")}
      variant="primary"
      errorFallback={t("coupons.error")}
      onRun={() => createCoupon(itemId)}
    />
  );
}

export function IssueCouponButton({ couponId, locale }: { couponId: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <ActionButton
      label={t("coupons.issue")}
      pendingLabel={t("coupons.issuing")}
      variant="success"
      errorFallback={t("coupons.error")}
      onRun={() => issueCoupon(couponId)}
    />
  );
}

export function RejectAwaitingButton({
  itemId,
  cardTitle,
  locale,
}: {
  itemId: string;
  cardTitle: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleReject = () => {
    setError(null);
    start(async () => {
      try {
        const r = await rejectAwaitingItem(itemId);
        if (r?.error) {
          setError(r.error);
        } else {
          setOpen(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("coupons.rejectAwaitingError"));
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
        {t("coupons.rejectAwaiting")}
      </Button>

      <ConfirmDialog
        open={open}
        title={t("coupons.rejectAwaitingConfirmTitle")}
        tone="danger"
        confirmLabel={t("coupons.rejectAwaiting")}
        busy={pending}
        message={
          <div className="space-y-2">
            <p>
              {t("coupons.rejectAwaitingConfirmMessage")} <strong className="text-ink">«{cardTitle}»</strong>?
            </p>
            <p className="text-xs text-ink-subtle">{t("coupons.rejectAwaitingHint")}</p>
            {error && (
              <p className="rounded-md bg-danger/10 p-2 text-xs font-medium text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        }
        onConfirm={handleReject}
        onClose={() => !pending && setOpen(false)}
      />
    </>
  );
}

export function DeleteCouponButton({
  couponId,
  couponNumber,
  locale,
}: {
  couponId: string;
  couponNumber: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
        setError(e instanceof Error ? e.message : t("coupons.deleteError"));
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
        {t("coupons.delete")}
      </Button>

      <ConfirmDialog
        open={open}
        title={t("coupons.deleteConfirmTitle")}
        tone="danger"
        confirmLabel={t("coupons.delete")}
        busy={pending}
        message={
          <div className="space-y-2">
            <p>
              {t("coupons.deleteConfirmMessage")}{" "}
              <strong className="font-mono text-ink">№ {couponNumber}</strong>?
            </p>
            <p className="text-xs text-ink-subtle">{t("coupons.deleteConfirmHint")}</p>
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
