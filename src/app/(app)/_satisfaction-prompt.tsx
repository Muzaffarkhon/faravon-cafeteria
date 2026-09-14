"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button, Textarea, cx } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { submitSatisfaction } from "./actions";

const DISMISS_KEY = "faravon.satisfaction.dismissedOn";
const LOW_RATING_MAX = 3;

/**
 * Опрос удовлетворённости (CSAT), см. src/lib/satisfaction.ts — сервер решает,
 * ПОЛОЖЕНО ли сотруднику увидеть опрос сейчас (`eligible`), а этот компонент
 * решает, показать ли его В ЭТОТ ЗАХОД: «Не сейчас» откладывает до следующего
 * дня (localStorage, только удобство, не источник истины), а отправленный
 * ответ убирает опрос до следующего цикла — это уже решает сервер.
 */
export function SatisfactionPrompt({ eligible, locale }: { eligible: boolean; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!eligible) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(DISMISS_KEY) === today) return;
    } catch {
      /* приватный режим — просто показываем */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [eligible]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString().slice(0, 10));
    } catch {
      /* не критично */
    }
    setOpen(false);
  }

  function submit() {
    if (!rating) return;
    setError(null);
    start(async () => {
      const r = await submitSatisfaction(rating, comment);
      if (r?.error) {
        setError(r.error);
        return;
      }
      setDone(true);
      setTimeout(() => setOpen(false), 1600);
    });
  }

  if (!open) return null;

  const shownRating = hoverRating || rating;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-5"
      role="presentation"
      onClick={() => !pending && !done && dismiss()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("satisfaction.title")}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] rounded-[20px] bg-surface p-7 text-center shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
      >
        {done ? (
          <>
            <div className="mb-2 text-[40px]" aria-hidden="true">
              🙏
            </div>
            <p className="font-display text-[17px] font-bold text-ink">{t("satisfaction.thanks")}</p>
          </>
        ) : (
          <>
            <p className="font-display text-[17px] font-bold text-ink">{t("satisfaction.title")}</p>
            <p className="mt-1.5 text-sm text-ink-muted">{t("satisfaction.subtitle")}</p>

            <div className="mt-5 flex justify-center gap-1.5" role="radiogroup" aria-label={t("satisfaction.title")}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={String(n)}
                  disabled={pending}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(n)}
                  className="p-1 text-[32px] leading-none transition-transform hover:scale-110"
                >
                  <span className={shownRating >= n ? "text-warning" : "text-line-strong"}>★</span>
                </button>
              ))}
            </div>

            {rating > 0 && rating <= LOW_RATING_MAX && (
              <div className="mt-4 text-left">
                <label htmlFor="satisfaction-comment" className="mb-1.5 block text-xs font-semibold text-ink-muted">
                  {t("satisfaction.commentLabel")}
                </label>
                <Textarea
                  id="satisfaction-comment"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("satisfaction.commentPlaceholder")}
                  disabled={pending}
                  maxLength={1000}
                />
              </div>
            )}

            {error && (
              <p className="mt-3 text-sm font-medium text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="mt-6 flex gap-2.5">
              <Button className="flex-1" disabled={!rating} loading={pending} onClick={submit}>
                {t("satisfaction.submit")}
              </Button>
              <button
                type="button"
                disabled={pending}
                onClick={dismiss}
                className={cx(
                  "flex-1 rounded-[10px] border-2 border-line px-3 py-[calc(0.75rem-2px)] text-[13px] font-bold text-ink transition hover:bg-surface-muted disabled:opacity-60",
                )}
              >
                {t("satisfaction.skip")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
