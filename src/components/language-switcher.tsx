"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, type Locale } from "@/lib/i18n/shared";
import { setLocale } from "@/app/i18n-actions";
import { cx } from "./ui";

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
                <span className="w-6 shrink-0 text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {LOCALE_SHORT[l]}
                </span>
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
