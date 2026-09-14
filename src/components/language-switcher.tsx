"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_SHORT, type Locale } from "@/lib/i18n/shared";
import { setLocale } from "@/app/i18n-actions";
import { cx } from "./ui";

// Эмодзи-флаги на Windows (без Segoe UI Emoji с цветными флагами) рендерятся
// как обычные буквы "RU"/"TJ"/"UZ" вместо флажка — поэтому рисуем флаг
// сами простыми SVG-полосами вместо эмодзи.
function FlagIcon({ locale, className }: { locale: Locale; className?: string }) {
  const stripes: Record<Locale, string[]> = {
    ru: ["#ffffff", "#0039a6", "#d52b1e"],
    tg: ["#cc0000", "#ffffff", "#006600"],
    uz: ["#0099b5", "#ffffff", "#1eb53a"],
  };
  const [a, b, c] = stripes[locale];
  const clipId = `flag-clip-${locale}`;
  return (
    <svg viewBox="0 0 20 14" className={className} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect width="20" height="14" rx="2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="20" height="4.67" fill={a} />
        <rect y="4.67" width="20" height="4.67" fill={b} />
        <rect y="9.33" width="20" height="4.67" fill={c} />
      </g>
      <rect width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.12" />
    </svg>
  );
}

/** Компактный переключатель языка — кнопка с инициалами (RU/TJ/UZ), раскрывает список. */
export function LanguageSwitcher({ locale, className }: { locale: Locale; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  function choose(l: Locale) {
    setOpen(false);
    if (l === locale) return;
    start(async () => {
      await setLocale(l);
      router.refresh();
    });
  }

  return (
    <div className={cx("relative", className)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-label="Язык интерфейса"
        aria-expanded={open}
        className="flex h-9 items-center justify-center rounded-full border border-line bg-surface px-2.5 text-xs font-bold tracking-wide text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
      >
        {LOCALE_SHORT[locale]}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-36 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          >
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                role="menuitemradio"
                aria-checked={l === locale}
                onClick={() => choose(l)}
                className={cx(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition-colors",
                  l === locale ? "bg-primary-soft text-primary-strong" : "text-ink hover:bg-surface-muted",
                )}
              >
                <FlagIcon locale={l} className="h-4 w-[22px] shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wide">{LOCALE_SHORT[l]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
