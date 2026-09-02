"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, Field, Input, cx } from "@/components/ui";
import { lookupCoupon, redeemCoupon, type CouponView } from "./actions";
import { CouponScanner } from "./_scanner";

type Phase = "idle" | "found" | "done";

/** Из результата сканирования достаёт номер купона (текст или ссылка ?number=). */
function extractNumber(raw: string): string {
  const s = raw.trim();
  const m = s.match(/[?&]number=([^&\s]+)/i);
  const val = m ? decodeURIComponent(m[1]) : s;
  return val.toUpperCase();
}

export function ProviderConfirm() {
  const [number, setNumber] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [coupon, setCoupon] = useState<CouponView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function doLookup(value: string) {
    setError(null);
    start(async () => {
      const r = await lookupCoupon(value);
      if (r.error) {
        setError(r.error);
        setCoupon(null);
        setPhase("idle");
      } else {
        setCoupon(r.coupon ?? null);
        setPhase("found");
      }
    });
  }

  function onLookup(e: React.FormEvent) {
    e.preventDefault();
    doLookup(number);
  }

  function onScan(raw: string) {
    const n = extractNumber(raw);
    setNumber(n);
    setPhase("idle");
    setCoupon(null);
    doLookup(n);
  }

  function onRedeem() {
    if (!coupon) return;
    setError(null);
    start(async () => {
      const r = await redeemCoupon(coupon.number);
      if (r.error) setError(r.error);
      else setPhase("done");
    });
  }

  function reset() {
    setNumber("");
    setCoupon(null);
    setError(null);
    setPhase("idle");
  }

  return (
    <div className="max-w-lg space-y-4">
      <form onSubmit={onLookup}>
        <Field
          label="Номер купона"
          htmlFor="coupon-number"
          hint="С купона сотрудника, формат FRV-YYYYMM-XXXXXX."
        >
          <div className="flex gap-2">
            <Input
              id="coupon-number"
              value={number}
              onChange={(e) => setNumber(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="FRV-202609-A1B2C3"
              className="font-mono"
            />
            <Button type="submit" loading={pending && phase === "idle"} className="shrink-0">
              Найти
            </Button>
          </div>
        </Field>
      </form>

      <CouponScanner onScan={onScan} />

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {coupon && phase !== "idle" && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm font-semibold text-ink" data-numeric>
              {coupon.number}
            </span>
            <Badge tone={coupon.status === "USED" ? "neutral" : coupon.redeemable ? "success" : "warning"}>
              {phase === "done" ? "Активирован" : coupon.statusLabel}
            </Badge>
          </div>

          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[130px_1fr]">
            <dt className="text-ink-muted">Сотрудник</dt>
            <dd className="font-medium text-ink">{coupon.employee}</dd>
            <dt className="text-ink-muted">Льгота</dt>
            <dd className="font-medium text-ink">{coupon.card}</dd>
            <dt className="text-ink-muted">Партнёр</dt>
            <dd className="font-medium text-ink">{coupon.partner ?? "—"}</dd>
            <dt className="text-ink-muted">Период</dt>
            <dd className="font-medium text-ink">{coupon.period}</dd>
            {coupon.validUntil && (
              <>
                <dt className="text-ink-muted">Действует до</dt>
                <dd
                  className={cx("font-medium", coupon.expired ? "text-danger" : "text-ink")}
                  data-numeric
                >
                  {coupon.validUntil}
                  {coupon.expired && " · срок истёк"}
                </dd>
              </>
            )}
          </dl>

          <div className="mt-5 space-y-3">
            {phase === "done" && (
              <>
                <p
                  className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success-strong"
                  role="status"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Купон активирован. Сотрудник получит уведомление.
                </p>
                <Button onClick={reset} fullWidth size="lg" autoFocus>
                  Активировать следующий купон
                </Button>
              </>
            )}

            {phase === "found" && coupon.redeemable && (
              <div className="flex items-center gap-3">
                <Button onClick={onRedeem} loading={pending}>
                  Активировать купон
                </Button>
                <Button variant="ghost" onClick={reset} disabled={pending}>
                  Отмена
                </Button>
              </div>
            )}

            {phase === "found" && !coupon.redeemable && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-danger">
                  {coupon.wrongPartner
                    ? `Купон партнёра «${coupon.partner ?? "другого партнёра"}» — вы активируете только свои купоны.`
                    : coupon.expired
                      ? `Срок действия купона истёк${coupon.validUntil ? ` ${coupon.validUntil}` : ""} — активировать нельзя.`
                      : `Купон в статусе «${coupon.statusLabel}» — активировать нельзя.`}
                </p>
                <Button variant="secondary" onClick={reset}>
                  Другой купон
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
