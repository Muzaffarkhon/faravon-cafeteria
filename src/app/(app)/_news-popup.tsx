"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui";
import { FormattedText } from "@/components/formatted-text";
import { markNewsRead } from "./_news-actions";
import type { PendingNews } from "./_news-query";

const dismissKey = (id: string) => `news-dismissed:${id}`;

/**
 * Попап новости на витрине. «Понятно» — пишет NewsRead (больше не покажется
 * никогда). «X» — только sessionStorage этой вкладки: при новой вкладке/входе
 * попап снова появится, пока не нажмут «Понятно» (см. спеку).
 */
export function NewsPopup({ news }: { news: PendingNews }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(dismissKey(news.id))) return;
    } catch {
      /* приватный режим / storage недоступен — просто показываем попап */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [news.id]);

  if (!open) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(news.id), "1");
    } catch {
      /* не критично — попап просто может показаться повторно в этой же вкладке */
    }
    setOpen(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold leading-snug text-ink">{news.title}</h3>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Закрыть"
            className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {news.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={news.imageUrl} alt="" className="mt-3 w-full rounded-xl object-cover" />
        )}

        <div className="mt-3 text-sm leading-6 text-ink">
          <FormattedText text={news.body} />
        </div>

        <p className="mt-3 text-sm">
          <Link href={`/news/${news.id}`} className="font-semibold text-primary-strong hover:underline">
            Подробнее →
          </Link>
        </p>

        <Button
          fullWidth
          className="mt-5"
          loading={pending}
          onClick={() => {
            start(async () => {
              await markNewsRead(news.id);
              setOpen(false);
            });
          }}
        >
          Понятно
        </Button>
      </div>
    </div>,
    document.body,
  );
}
