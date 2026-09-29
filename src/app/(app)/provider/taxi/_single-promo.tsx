"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Input } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { sendSingleTaxiPromoAction } from "./actions";
import type { PromoStatus } from "@/lib/taxi";

export function SinglePromoCell({
  itemId,
  initialPromo,
  status,
  locale,
}: {
  itemId: string;
  initialPromo: string | null;
  status: PromoStatus;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [editing, setEditing] = useState(false);
  const [promo, setPromo] = useState(initialPromo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    if (!promo.trim()) {
      setError("Введите промокод");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("itemId", itemId);
      formData.set("promo", promo.trim());
      const res = await sendSingleTaxiPromoAction({}, formData);
      if (res.error) {
        setError(res.error);
      } else {
        setEditing(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {initialPromo ? (
          <code className="rounded bg-surface-muted px-2 py-0.5 font-mono text-xs font-bold text-ink border border-line-subtle">
            {initialPromo}
          </code>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        )}

        {status === "DELIVERED" && <Badge tone="success">{t("providerTaxi.delivered")}</Badge>}
        {status === "BLOCKED" && (
          <span title={t("providerTaxi.blockedHint")}>
            <Badge tone="warning">{t("providerTaxi.statusBlocked")}</Badge>
          </span>
        )}
        {status === "PENDING" && <Badge tone="neutral">{t("providerTaxi.statusPending")}</Badge>}
        {status === "NONE" && <Badge tone="neutral">{t("providerTaxi.statusNone")}</Badge>}

        {!editing && (
          <button
            type="button"
            onClick={() => {
              setPromo(initialPromo ?? "");
              setEditing(true);
            }}
            className="text-xs font-semibold text-primary hover:underline ml-1"
          >
            {initialPromo ? t("providerTaxi.changePromo") : t("providerTaxi.sendSingle")}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-1 flex items-center gap-1.5 animate-in fade-in duration-150">
          <Input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="Промокод…"
            className="h-8 text-xs min-w-32 py-0"
            autoFocus
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
              if (e.key === "Escape") {
                setEditing(false);
              }
            }}
          />
          <Button size="sm" onClick={handleSave} loading={isPending}>
            OK
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            disabled={isPending}
          >
            ✕
          </Button>
        </div>
      )}

      {error && <p className="text-[11px] font-medium text-danger">{error}</p>}
    </div>
  );
}
