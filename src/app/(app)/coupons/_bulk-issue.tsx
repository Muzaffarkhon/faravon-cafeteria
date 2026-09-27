"use client";

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { bulkIssueCoupons } from "./actions";

const BulkSelectContext = createContext<{
  selected: Set<string>;
  toggle: (id: string) => void;
} | null>(null);

/** Оборачивает таблицу купонов — держит выбор чекбоксов для массовой выдачи. */
export function BulkIssueProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return <BulkSelectContext.Provider value={{ selected, toggle }}>{children}</BulkSelectContext.Provider>;
}

export function CouponSelectCheckbox({ couponId }: { couponId: string }) {
  const ctx = useContext(BulkSelectContext);
  if (!ctx) return null;
  return (
    <input
      type="checkbox"
      className="size-4 accent-primary"
      checked={ctx.selected.has(couponId)}
      onChange={() => ctx.toggle(couponId)}
      aria-label="Выбрать купон"
    />
  );
}

export function BulkIssueToolbar({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const ctx = useContext(BulkSelectContext);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ids = useMemo(() => (ctx ? Array.from(ctx.selected) : []), [ctx?.selected]);

  if (!ctx || ids.length === 0) return null;

  const handleConfirm = () => {
    setError(null);
    start(async () => {
      const r = await bulkIssueCoupons(ids);
      if (r?.error) {
        setError(r.error);
        return;
      }
      setNotice(r?.notice ?? null);
      setOpen(false);
      ids.forEach((id) => ctx.toggle(id));
    });
  };

  return (
    <div className="flex items-center gap-2 rounded-[12px] bg-primary/10 px-3 py-2">
      <span className="text-sm font-semibold text-ink">{t("coupons.bulkSelected")} {ids.length}</span>
      <Button variant="success" size="sm" onClick={() => setOpen(true)}>
        {t("coupons.bulkIssue")}
      </Button>
      {notice && <span className="text-xs text-ink-muted">{notice}</span>}

      <ConfirmDialog
        open={open}
        title={t("coupons.bulkIssueConfirmTitle")}
        tone="success"
        confirmLabel={t("coupons.bulkIssue")}
        busy={pending}
        message={
          <div className="space-y-2">
            <p>
              {t("coupons.bulkIssueConfirmMessage")} <strong className="text-ink">{ids.length}</strong>?
            </p>
            {error && (
              <p className="rounded-md bg-danger/10 p-2 text-xs font-medium text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        }
        onConfirm={handleConfirm}
        onClose={() => !pending && setOpen(false)}
      />
    </div>
  );
}
