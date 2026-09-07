"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, cx } from "@/components/ui";
import { lookupCoupon, lookupCouponByPhone, redeemCoupon, type CouponView } from "./actions";
import { CouponScanner } from "./_scanner";

type Phase = "idle" | "found" | "not_found" | "no_benefit" | "done";

/** Из результата сканирования достаёт номер купона (текст или ссылка ?number=). */
function extractNumber(raw: string): string {
  const s = raw.trim();
  const m = s.match(/[?&]number=([^&\s]+)/i);
  const val = m ? decodeURIComponent(m[1]) : s;
  return val.toUpperCase();
}

function ResultIcon({ tone }: { tone: "success" | "neutral" }) {
  return (
    <div
      className={cx(
        "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold",
        tone === "success" ? "bg-success text-on-brand" : "bg-surface-sunken text-primary",
      )}
      aria-hidden="true"
    >
      {tone === "success" ? "✓" : "!"}
    </div>
  );
}

export function ProviderConfirm() {
  // ── Основной сценарий: касса партнёра, поиск по телефону ──
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [coupon, setCoupon] = useState<CouponView | null>(null);
  const [notFoundName, setNotFoundName] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Резервный сценарий: ручной ввод номера купона / QR ──
  const [manualOpen, setManualOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  function onPhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await lookupCouponByPhone(phone);
      if (r.status === "found") {
        setCoupon(r.coupon);
        setPhase("found");
      } else if (r.status === "no_benefit") {
        setNotFoundName(r.employee);
        setPhase("no_benefit");
      } else {
        setNotFoundName(null);
        setPhase("not_found");
      }
    });
  }

  function onActivate() {
    if (!coupon) return;
    setError(null);
    start(async () => {
      const r = await redeemCoupon(coupon.number);
      if (r.error) setError(r.error);
      else setPhase("done");
    });
  }

  function reset() {
    setPhone("");
    setCoupon(null);
    setNotFoundName(null);
    setError(null);
    setPhase("idle");
  }

  function doManualLookup(value: string) {
    setManualError(null);
    start(async () => {
      const r = await lookupCoupon(value);
      if (r.error) {
        setManualError(r.error);
        setCoupon(null);
        setPhase("idle");
      } else {
        setCoupon(r.coupon ?? null);
        setPhase("found");
      }
    });
  }

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    doManualLookup(number);
  }

  function onScan(raw: string) {
    const n = extractNumber(raw);
    setNumber(n);
    doManualLookup(n);
  }

  // ── Найдено: карточка с данными и активацией ──
  if (phase === "found" && coupon) {
    return (
      <div className="mx-auto max-w-sm">
        <div className="rounded-[24px] bg-surface p-7 text-center shadow-md">
          <ResultIcon tone="success" />
          <div className="font-display text-[17px] font-bold text-ink">{coupon.employee}</div>
          <div className="mt-1 text-sm text-ink-muted">{coupon.department}</div>

          <div className="my-5 rounded-2xl bg-primary-soft p-4">
            <div className="text-[13px] font-bold uppercase tracking-[0.06em] text-primary-strong">
              Действующая льгота
            </div>
            <div className="mt-1.5 text-[16px] font-bold text-ink">{coupon.card}</div>
            {coupon.condition && (
              <div className="mt-1 font-display text-[22px] font-bold text-primary">
                {coupon.condition}
              </div>
            )}
          </div>

          {error && (
            <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}

          {coupon.redeemable ? (
            <Button fullWidth size="lg" loading={pending} onClick={onActivate} className="mb-2">
              Активировать скидку
            </Button>
          ) : (
            <p className="mb-2 text-sm font-medium text-danger">
              {coupon.wrongPartner
                ? `Купон партнёра «${coupon.partner ?? "другого партнёра"}» — вы активируете только свои купоны.`
                : `Купон в статусе «${coupon.statusLabel}» — активировать нельзя.`}
            </p>
          )}
          <Button variant="ghost" fullWidth onClick={reset} disabled={pending}>
            Следующий клиент
          </Button>
        </div>
      </div>
    );
  }

  // ── Активировано ──
  if (phase === "done") {
    return (
      <div className="mx-auto max-w-sm">
        <div className="rounded-[24px] bg-success p-9 text-center text-on-brand shadow-md">
          <div className="mb-2 text-[40px] font-bold" aria-hidden="true">
            ✓
          </div>
          <div className="font-display text-[17px] font-bold">Скидка применена</div>
          <div className="mt-1 text-sm text-on-brand/85">Купон отмечен как использованный</div>
          <button
            type="button"
            onClick={reset}
            className="mt-5 w-full rounded-[14px] bg-on-brand py-3.5 text-sm font-bold text-success-strong transition-colors hover:bg-on-brand/90"
          >
            Следующий клиент
          </button>
        </div>
      </div>
    );
  }

  // ── Не найдено / нет действующей льготы ──
  if (phase === "not_found" || phase === "no_benefit") {
    return (
      <div className="mx-auto max-w-sm">
        <div className="rounded-[24px] bg-surface p-7 text-center shadow-md">
          <ResultIcon tone="neutral" />
          <div className="font-display text-[17px] font-bold text-ink">
            {phase === "no_benefit" ? `${notFoundName} — нет действующей льготы` : "Сотрудник не найден"}
          </div>
          <p className="mt-1.5 text-sm leading-6 text-ink-muted">
            {phase === "no_benefit"
              ? "У сотрудника нет выданного купона у вашего партнёра."
              : "Проверьте номер телефона или попросите клиента показать QR купона."}
          </p>
          <Button fullWidth className="mt-5" onClick={reset}>
            Попробовать снова
          </Button>
        </div>
      </div>
    );
  }

  // ── Исходное состояние: ввод телефона ──
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <div className="rounded-[24px] bg-surface p-6 shadow-md">
        <form onSubmit={onPhoneSubmit}>
          <label
            htmlFor="cashier-phone"
            className="mb-2 block text-[13px] font-bold uppercase tracking-[0.06em] text-ink-muted"
          >
            Номер телефона клиента
          </label>
          <Input
            id="cashier-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="off"
            placeholder="+992 __ ___ __ __"
            className="mb-3.5 rounded-[14px] py-4 text-center text-xl font-bold"
          />
          <Button type="submit" fullWidth size="lg" loading={pending}>
            Проверить
          </Button>
        </form>

        <div className="my-4 flex items-center gap-2.5">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-ink-subtle">или</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setManualOpen((v) => !v);
            setManualError(null);
          }}
        >
          Ввести номер купона / сканировать QR
        </Button>
      </div>

      {!manualOpen && (
        <p className="text-center text-xs leading-6 text-ink-subtle">
          Работает, даже если сотрудник не знает про программу — кассир вводит номер телефона,
          система сама находит льготу.
        </p>
      )}

      {manualOpen && (
        <div className="space-y-4 rounded-[18px] bg-surface p-5 shadow-sm">
          <form onSubmit={onManualSubmit}>
            <Field label="Номер купона" htmlFor="coupon-number" hint="Формат FRV-YYYYMM-XXXXXX.">
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
                <Button type="submit" loading={pending} className="shrink-0">
                  Найти
                </Button>
              </div>
            </Field>
          </form>
          <CouponScanner onScan={onScan} />
          {manualError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
              {manualError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
