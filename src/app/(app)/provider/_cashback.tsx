"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { CODE_DIGITS, calcCashback, formatSomoni, parseSomoni } from "@/lib/cashback-math";
import { submitCashback, type CashbackView } from "./actions";

type Done = { redeem: number; paid: number; accrue: number; newBalance: number };

/** Касса: покупка с кешбеком — ввод суммы, предпросмотр (спишется / к оплате / начислится), проведение. */
export function CashbackForm({
  view,
  locale,
  onBack,
}: {
  view: CashbackView;
  locale: Locale;
  onBack: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const cur = t("provider.cb.currency");
  const [text, setText] = useState("");
  // По умолчанию кешбек НЕ списывается: списание — только по просьбе клиента.
  const [useBalance, setUseBalance] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, start] = useTransition();

  const purchase = parseSomoni(text);
  const calc = useMemo(
    () =>
      purchase === null
        ? null
        : calcCashback({
            purchase,
            balance: view.balance,
            percent: view.percent,
            canAccrue: view.canAccrue,
            useBalance,
          }),
    [purchase, view.balance, view.percent, view.canAccrue, useBalance],
  );
  const nothingToDo = !!calc && calc.redeem === 0 && calc.accrue === 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (purchase === null) {
      setError(t("provider.errors.invalidAmount"));
      return;
    }
    if (!new RegExp(`^\\d{${CODE_DIGITS}}$`).test(code.replace(/\s/g, ""))) {
      setError(t("provider.errors.invalidCode"));
      return;
    }
    setError(null);
    start(async () => {
      // Токен операции одноразовый по смыслу: повторное нажатие «Провести» вернёт результат первой операции.
      const r = await submitCashback({ token: view.token, purchase, useBalance, code });
      if (r.ok) setDone(r);
      else setError(r.error);
    });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm">
        <div className="rounded-[24px] bg-success p-8 text-center text-on-brand shadow-md">
          <div className="mb-2 text-[40px] font-bold" aria-hidden="true">
            ✓
          </div>
          <div className="font-display text-[17px] font-bold">{t("provider.cb.doneTitle")}</div>
          <dl className="mt-4 space-y-1.5 text-sm text-on-brand/90" data-numeric>
            <div className="flex justify-between">
              <dt>{t("provider.cb.doneToPay")}</dt>
              <dd className="font-bold">
                {formatSomoni(done.paid)} {cur}
              </dd>
            </div>
            {done.redeem > 0 && (
              <div className="flex justify-between">
                <dt>{t("provider.cb.redeem")}</dt>
                <dd className="font-bold">
                  {formatSomoni(done.redeem)} {cur}
                </dd>
              </div>
            )}
            {done.accrue > 0 && (
              <div className="flex justify-between">
                <dt>{t("provider.cb.doneAccrued")}</dt>
                <dd className="font-bold">
                  {formatSomoni(done.accrue)} {cur}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>{t("provider.cb.doneBalance")}</dt>
              <dd className="font-bold">
                {formatSomoni(done.newBalance)} {cur}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={onBack}
            className="mt-5 w-full rounded-[14px] bg-on-brand py-3.5 text-sm font-bold text-success-strong transition-colors hover:bg-on-brand/90"
          >
            {t("provider.nextClient")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <form onSubmit={onSubmit} className="rounded-[24px] bg-surface p-7 shadow-md">
        <div className="text-center">
          <div className="font-display text-[17px] font-bold text-ink">{view.employee}</div>
          <div className="mt-1 text-sm text-ink-muted">{view.department}</div>
        </div>

        <div className="my-5 rounded-2xl bg-primary-soft p-4">
          <div className="text-[13px] font-bold uppercase tracking-[0.06em] text-primary-strong">
            {t("provider.cb.balance")}
            {view.partner ? ` · ${view.partner}` : ""}
          </div>
          <div className="mt-1 font-display text-[26px] font-bold text-primary" data-numeric>
            {formatSomoni(view.balance)} {cur}
          </div>
          {view.canAccrue && (
            <div className="mt-1 text-xs font-medium text-primary-strong/80">
              {view.cardTitle ? `${view.cardTitle} · ` : ""}
              {t("provider.cb.rate")} {view.percent}%
            </div>
          )}
        </div>

        <Field label={`${t("provider.cb.purchase")}, ${cur}`} htmlFor="cb-purchase">
          <Input
            id="cb-purchase"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            placeholder="0,00"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>

        <Field label={t("provider.cb.code")} htmlFor="cb-code" hint={t("provider.cb.codeHint")}>
          <Input
            id="cb-code"
            inputMode="numeric"
            pattern="[0-9 ]*"
            autoComplete="one-time-code"
            maxLength={CODE_DIGITS + 1}
            placeholder="0000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>

        {view.balance > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={useBalance}
              onChange={(e) => setUseBalance(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
            />
            {t("provider.cb.useBalance")}
          </label>
        )}

        {calc && (
          <dl className="mt-4 space-y-1.5 rounded-xl bg-surface-muted p-3 text-sm" data-numeric>
            {calc.redeem > 0 && (
              <div className="flex justify-between text-ink-muted">
                <dt>{t("provider.cb.redeem")}</dt>
                <dd className="font-semibold">
                  −{formatSomoni(calc.redeem)} {cur}
                </dd>
              </div>
            )}
            <div className="flex justify-between text-ink">
              <dt className="font-semibold">{t("provider.cb.toPay")}</dt>
              <dd className="font-display text-lg font-bold">
                {formatSomoni(calc.paid)} {cur}
              </dd>
            </div>
            {view.canAccrue && (
              <div className="flex justify-between text-success-strong">
                <dt>{t("provider.cb.accrue")}</dt>
                <dd className="font-semibold">
                  +{formatSomoni(calc.accrue)} {cur}
                </dd>
              </div>
            )}
          </dl>
        )}

        {!view.canAccrue && <p className="mt-3 text-xs text-ink-subtle">{t("provider.cb.noAccrue")}</p>}

        {error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" fullWidth size="lg" loading={pending} disabled={!calc || nothingToDo || code.replace(/\s/g, "").length !== CODE_DIGITS} className="mt-4">
          {t("provider.cb.submit")}
        </Button>
        <Button type="button" variant="ghost" fullWidth onClick={onBack} disabled={pending} className="mt-2">
          {t("provider.nextClient")}
        </Button>
      </form>
    </div>
  );
}
