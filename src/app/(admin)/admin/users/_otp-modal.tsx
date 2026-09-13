"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";

/** Модальное окно с одноразовым паролем — показывается один раз, нельзя не заметить. */
export function OtpModal({
  otp,
  login,
  /** Учётка подрядчика: PIN не одноразовый и не требует смены (общий код на кассу точки). */
  permanent,
  onClose,
  locale = "ru",
}: {
  otp: string;
  login?: string;
  permanent?: boolean;
  onClose: () => void;
  locale?: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(login ? `${login} ${otp}` : otp);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* буфер недоступен — пусть перепишут вручную */
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-2xl"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary-strong">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h2 className="mt-3 text-lg font-semibold text-ink">{t("users.otp.accountCreated")}</h2>
        {login && (
          <p className="mt-1 text-sm text-ink-muted">
            {t("users.otp.loginLabel")} <b className="font-mono text-ink">{login}</b>
          </p>
        )}
        <p className="mt-3 text-xs uppercase tracking-[0.12em] text-ink-subtle">
          {permanent ? t("users.otp.permanentPin") : t("users.otp.tempPassword")}
        </p>
        <p className="mt-1.5 select-all font-mono text-2xl font-bold tracking-wider text-primary-strong">
          {otp}
        </p>
        <p className="mt-3 text-xs leading-5 text-ink-muted">
          {permanent ? t("users.otp.permanentHint") : t("users.otp.tempHint")}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" fullWidth onClick={copy}>
            {copied ? t("users.otp.copied") : t("users.otp.copy")}
          </Button>
          <Button fullWidth onClick={onClose}>
            {t("users.otp.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
