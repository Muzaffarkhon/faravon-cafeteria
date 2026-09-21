"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Field, Input, cx } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { lookupCoupon, lookupCouponByPhone, redeemCoupon, type CashbackView, type CouponView } from "./actions";
import { CashbackForm } from "./_cashback";
import { CouponScanner } from "./_scanner";

type Phase = "idle" | "found" | "cashback" | "not_found" | "no_benefit" | "done";

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

export function ProviderConfirm({ locale, initialNumber }: { locale: Locale; initialNumber?: string }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  // ── Основной сценарий: касса партнёра, поиск по телефону ──
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [coupon, setCoupon] = useState<CouponView | null>(null);
  // Купона уже нет, но у сотрудника остался кешбек у этого партнёра.
  const [cashbackOnly, setCashbackOnly] = useState<CashbackView | null>(null);
  const [notFoundName, setNotFoundName] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Резервный сценарий: сканирование QR (камера видна сразу на экране,
  // без лишнего тапа), ручной ввод — если не распозналось ──
  const [showManual, setShowManual] = useState(false);
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
      } else if (r.status === "cashback_only") {
        setCashbackOnly(r.cashback);
        setPhase("cashback");
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
    setCashbackOnly(null);
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

  /**
   * Купон из QR — и со встроенной камеры кассы, и по ссылке из обычной камеры
   * телефона. Если купон найден и его можно погасить (тот же партнёр, не
   * просрочен, нужный статус) — активируем сразу, без отдельного тапа
   * «Активировать»: сам QR виден только владельцу купона, а вход и право
   * `coupons.confirm` уже проверены (страница кассы — в page.tsx, каждый
   * серверный экшен — ещё раз у себя). Лишний тап тут ничего не защищает.
   * Если погасить нельзя (чужой партнёр/просрочен/и т.п.) — показываем
   * карточку с причиной и ничего не активируем.
   */
  function lookupAndRedeem(value: string) {
    setManualError(null);
    setError(null);
    start(async () => {
      const r = await lookupCoupon(value);
      if (r.error) {
        setManualError(r.error);
        setCoupon(null);
        setPhase("idle");
        return;
      }
      const c = r.coupon ?? null;
      setCoupon(c);
      // Кешбек считается от суммы покупки — её вводит кассир, поэтому такой
      // купон всегда ведём в форму кешбека, а не гасим молча.
      if (!c?.redeemable || c.cashback) {
        setPhase("found");
        return;
      }
      const red = await redeemCoupon(c.number);
      if (red.error) {
        setError(red.error);
        setPhase("found");
      } else {
        setPhase("done");
      }
    });
  }

  // Открыто по ссылке из QR (обычной камерой): сразу гасим купон и убираем номер
  // из адреса, чтобы обновление страницы не повторяло операцию.
  const autoLookedUp = useRef(false);
  useEffect(() => {
    if (!initialNumber || autoLookedUp.current) return;
    autoLookedUp.current = true;
    setNumber(initialNumber);
    lookupAndRedeem(initialNumber);
    window.history.replaceState(null, "", "/provider");
  }, [initialNumber]);

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    doManualLookup(number);
  }

  function onScan(raw: string) {
    const n = extractNumber(raw);
    setNumber(n);
    lookupAndRedeem(n);
  }

  // ── Кешбек: ввод суммы покупки (по купону или только накопленный баланс) ──
  if (phase === "cashback" && cashbackOnly) {
    return <CashbackForm view={cashbackOnly} locale={locale} onBack={reset} />;
  }
  if (phase === "found" && coupon?.cashback) {
    return <CashbackForm view={coupon.cashback} locale={locale} onBack={reset} />;
  }

  // ── Найдено: карточка с данными и активацией ──
  if (phase === "found" && coupon) {
    return (
      <div className="mx-auto max-w-sm">
        <div className="rounded-[24px] bg-surface p-7 text-center shadow-md">
          <ResultIcon tone={coupon.redeemable ? "success" : "neutral"} />
          <div className="font-display text-[17px] font-bold text-ink">{coupon.employee}</div>
          <div className="mt-1 text-sm text-ink-muted">{coupon.department}</div>

          <div className="my-5 rounded-2xl bg-primary-soft p-4">
            <div className="text-[13px] font-bold uppercase tracking-[0.06em] text-primary-strong">
              {t("provider.activeBenefit")}
            </div>
            <div className="mt-1.5 text-[16px] font-bold text-ink">{coupon.card}</div>
            {coupon.condition && (
              <div className="mt-1 font-display text-[22px] font-bold text-primary">
                {coupon.condition}
              </div>
            )}
            {coupon.validFrom && coupon.validUntil && (
              <div className="mt-1.5 text-xs font-medium text-primary-strong/80" data-numeric>
                {t("provider.validPeriod")}: {coupon.validFrom} – {coupon.validUntil}
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
              {t("provider.activate")}
            </Button>
          ) : (
            <p className="mb-2 text-sm font-medium text-danger">
              {coupon.wrongPartner
                ? `${t("provider.wrongPartnerPrefix")} «${coupon.partner ?? t("provider.otherPartner")}» ${t("provider.wrongPartnerSuffix")}`
                : coupon.notYetValid
                  ? `${t("provider.notYetValidPrefix")} ${coupon.validFrom}.`
                  : `${t("provider.statusCantActivatePrefix")} «${coupon.statusLabel}» ${t("provider.statusCantActivateSuffix")}`}
            </p>
          )}
          <Button variant="ghost" fullWidth onClick={reset} disabled={pending}>
            {t("provider.nextClient")}
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
          <div className="font-display text-[17px] font-bold">{t("provider.discountApplied")}</div>
          <div className="mt-1 text-sm text-on-brand/85">{t("provider.couponUsed")}</div>
          <button
            type="button"
            onClick={reset}
            className="mt-5 w-full rounded-[14px] bg-on-brand py-3.5 text-sm font-bold text-success-strong transition-colors hover:bg-on-brand/90"
          >
            {t("provider.nextClient")}
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
            {phase === "no_benefit" ? `${notFoundName} — ${t("provider.noBenefitSuffix")}` : t("provider.employeeNotFound")}
          </div>
          <p className="mt-1.5 text-sm leading-6 text-ink-muted">
            {phase === "no_benefit" ? t("provider.noBenefitHint") : t("provider.notFoundHint")}
          </p>
          <Button fullWidth className="mt-5" onClick={reset}>
            {t("provider.tryAgain")}
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
            {t("provider.clientPhone")}
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
            {t("provider.check")}
          </Button>
        </form>
        <p className="mt-2 text-center text-xs leading-6 text-ink-subtle">{t("provider.phoneHint")}</p>

        <div className="my-4 flex items-center gap-2.5">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-ink-subtle">{t("provider.or")}</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        {/* Камера видна сразу на экране кассы (без лишнего тапа) — валидный
            скан своего купона активируется мгновенно, без отдельного тапа
            «Активировать» (см. onScan). Ручной ввод — если QR не считался. */}
        <div className="space-y-4">
          <CouponScanner onScan={onScan} autoStart onFallback={() => setShowManual(true)} locale={locale} />

          {!showManual && (
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="mx-auto block text-sm font-medium text-primary-strong underline underline-offset-2"
            >
              {t("provider.qrNotReading")}
            </button>
          )}

          {showManual && (
            <form onSubmit={onManualSubmit}>
              <Field label={t("provider.couponNumberLabel")} htmlFor="coupon-number" hint={t("provider.couponNumberHint")}>
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
                    autoFocus
                  />
                  <Button type="submit" loading={pending} className="shrink-0">
                    {t("provider.find")}
                  </Button>
                </div>
              </Field>
            </form>
          )}

          {manualError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
              {manualError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
