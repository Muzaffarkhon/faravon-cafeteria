"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";

/** Ссылка привязки телефона кассы: QR (навести камеру телефона подрядчика) + ссылка для отправки. Показывается один раз. */
export function CashierLinkModal({
  url,
  qrSvg,
  expiresAt,
  login,
  onClose,
  locale,
}: {
  url: string;
  qrSvg: string;
  expiresAt: string;
  login: string;
  onClose: () => void;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* буфер недоступен — ссылку можно выделить и скопировать вручную */
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-2xl">
        <h2 className="text-lg font-semibold text-ink">{t("users.acc.cashierPhoneTitle")}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          <b className="font-mono text-ink">{login}</b>
        </p>
        <div
          className="mx-auto mt-4 w-fit rounded-xl bg-white p-3 shadow-sm"
          // SVG строится на сервере из нашей же ссылки (qrcode) — не пользовательский ввод.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <p className="mt-3 break-all select-all rounded-lg bg-surface-muted px-3 py-2 font-mono text-[11px] leading-4 text-ink-muted">{url}</p>
        <p className="mt-3 text-xs text-ink-muted">
          {t("users.acc.cashierPhoneExpires")}{" "}
          <b className="text-ink" data-numeric>
            {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(expiresAt))}
          </b>
        </p>
        <p className="mt-2 text-xs leading-5 text-ink-muted">{t("users.acc.cashierPhoneHint")}</p>
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
