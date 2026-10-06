"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Button, Textarea, cx } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { submitSatisfaction } from "./actions";
import { dushanbeDateKey } from "@/lib/dushanbe-date";

const DISMISS_KEY = "faravon.satisfaction.dismissedOn";
const LOW_RATING_MAX = 3;

/**
 * Опрос удовлетворённости (CSAT), см. src/lib/satisfaction.ts — сервер решает,
 * ПОЛОЖЕНО ли сотруднику увидеть опрос сейчас (`eligible`), а этот компонент
 * решает, показать ли его В ЭТОТ ЗАХОД: «Не сейчас» откладывает до следующего
 * дня (localStorage, только удобство, не источник истины), а отправленный
 * ответ убирает опрос до следующего цикла — это уже решает сервер.
 */
export function SatisfactionPrompt({
  eligible,
  locale,
  giftSpins = 0,
  preview = false,
  onClosePreview,
}: {
  eligible: boolean;
  locale: Locale;
  /** Сколько бесплатных прокруток колеса подарят за оценку (0 — колесо выключено / без подарка). */
  giftSpins?: number;
  /** true — показать сразу, минуя право/localStorage, и не писать ответ в базу
   *  (кнопка «Предпросмотр» в /admin/satisfaction — увидеть текст без реальной
   *  выдачи купона и включённой настройки). */
  preview?: boolean;
  onClosePreview?: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(preview);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (preview || !eligible) return;
    try {
      const today = dushanbeDateKey();
      if (localStorage.getItem(DISMISS_KEY) === today) return;
    } catch {
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [eligible, preview]);

  function dismiss() {
    if (!preview) {
      try {
        localStorage.setItem(DISMISS_KEY, dushanbeDateKey());
      } catch {
      }
    }
    setOpen(false);
    onClosePreview?.();
  }

  function submit() {
    if (!rating) return;
    if (preview) {
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        onClosePreview?.();
      }, 1600);
      return;
    }
    setError(null);
    start(async () => {
      const r = await submitSatisfaction(rating, comment);
      if (r?.error) {
        setError(r.error);
        return;
      }
      setDone(true);
      if (!giftSpins) setTimeout(() => setOpen(false), 1600);
    });
  }

  if (!open) return null;

  const shownRating = hoverRating || rating;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-5"
      role="presentation"
      onClick={() => !pending && (done ? setOpen(false) : dismiss())}
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
            <div className="mb-2 text-[40px] leading-none text-warning" aria-hidden="true">
              ★
            </div>
            <p className="font-display text-[17px] font-bold text-ink">{t("satisfaction.thanks")}</p>
            {giftSpins > 0 && !preview && (
              <>
                <p className="mt-2 text-sm text-ink-muted">{t("satisfaction.giftDone")}</p>
                <Link
                  href="/gamification/wheel"
                  onClick={() => setOpen(false)}
                  className="mt-4 inline-flex rounded-[10px] bg-primary px-4 py-2.5 text-sm font-bold text-on-brand"
                >
                  🎁 +{giftSpins}
                </Link>
              </>
            )}
          </>
        ) : (
          <>
            <p className="font-display text-[17px] font-bold text-ink">{t("satisfaction.title")}</p>
            <p className="mt-1.5 text-sm text-ink-muted">{t("satisfaction.subtitle")}</p>
            {giftSpins > 0 && (
              <p className="mt-3 rounded-[10px] bg-success-soft px-3 py-2 text-xs font-semibold text-success-strong">
                {t("satisfaction.giftHint")} {giftSpins}
              </p>
            )}

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
