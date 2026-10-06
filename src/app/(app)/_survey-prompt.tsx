"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button, Textarea, cx } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import type { PendingSurvey, SurveyAnswers } from "@/lib/surveys";
import { submitSurveyAnswers } from "./actions";
import { dushanbeDateKey } from "@/lib/dushanbe-date";

const DISMISS_KEY = "faravon.survey.dismissed";

/**
 * Опрос за монеты (src/lib/surveys.ts): окно при заходе на сайт — заставка с наградой,
 * затем по одному вопросу на экран с прогрессом. «Не сейчас» откладывает этот опрос
 * до завтра (localStorage — только удобство); пройденный опрос сервер больше не отдаёт.
 */
export function SurveyPrompt({ survey, locale, coinUnit }: { survey: PendingSurvey; locale: Locale; coinUnit: string }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = survey.questions.length;
  const dismissValue = `${survey.id}:${dushanbeDateKey()}`;

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === dismissValue) return;
    } catch {
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage доступен только после монтирования
    setOpen(true);
  }, [dismissValue]);

  function later() {
    try {
      localStorage.setItem(DISMISS_KEY, dismissValue);
    } catch {
    }
    setOpen(false);
  }

  const q = step >= 0 ? survey.questions[step] : null;
  const value = q ? answers[q.id] : undefined;
  const answered = q
    ? q.kind === "TEXT"
      ? typeof value === "string" && value.trim().length > 0
      : Array.isArray(value)
        ? value.length > 0
        : typeof value === "string"
    : true;
  const canGoOn = !q || !q.required || answered;
  const last = step === total - 1;

  function setValue(v: string | string[]) {
    if (!q) return;
    setAnswers((a) => ({ ...a, [q.id]: v }));
  }

  function next() {
    setError(null);
    if (!last) {
      setStep(step + 1);
      return;
    }
    start(async () => {
      const r = await submitSurveyAnswers(survey.id, answers);
      if (r.error) setError(r.error);
      else setDone(true);
    });
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-5" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={survey.title}
        className="flex max-h-[92dvh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-[24px] bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.25)] sm:rounded-[24px]"
      >
        <div className="h-1.5 w-full bg-surface-muted" aria-hidden="true">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${done ? 100 : ((step + 1) / (total + 1)) * 100}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {done ? (
            <div className="py-6 text-center">
              <div className="mb-3 text-5xl" aria-hidden="true">
                🎉
              </div>
              <p className="font-display text-lg font-bold text-ink">{t("survey.thanks")}</p>
              {survey.coins > 0 && (
                <p className="mt-2 text-sm font-semibold text-success-strong">
                  {t("survey.coinsEarned")} +{survey.coins} {coinUnit}
                </p>
              )}
              {survey.giftSpin && <p className="mt-2 text-sm font-semibold text-success-strong">{t("survey.giftSpin")}</p>}
            </div>
          ) : !q ? (
            <div className="text-center">
              <span className="inline-flex rounded-full bg-primary-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-strong">
                {t("survey.badge")} · {total}
              </span>
              <h2 className="mt-4 font-display text-xl font-bold text-ink">{survey.title}</h2>
              {survey.description && <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{survey.description}</p>}
              {survey.coins > 0 && (
                <p className="mt-5 rounded-[14px] bg-success-soft px-4 py-3 text-sm font-semibold text-success-strong">
                  🪙 {t("survey.reward")} +{survey.coins} {coinUnit}
                </p>
              )}
              {survey.giftSpin && (
                <p className="mt-3 rounded-[14px] bg-success-soft px-4 py-3 text-sm font-semibold text-success-strong">
                  {t("survey.giftSpin")}
                </p>
              )}
            </div>
          ) : (
            <fieldset>
              <legend className="text-xs font-semibold text-ink-subtle">
                {t("survey.questionOf")} {step + 1} {t("survey.of")} {total}
                {!q.required && ` · ${t("survey.optional")}`}
              </legend>
              <p className="mt-2 font-display text-lg font-bold text-ink">{q.text}</p>
              {q.kind === "MULTI" && <p className="mt-1 text-xs text-ink-muted">{t("survey.multiHint")}</p>}

              {q.kind === "TEXT" ? (
                <Textarea
                  className="mt-4"
                  rows={4}
                  maxLength={1000}
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={t("survey.textPlaceholder")}
                  aria-label={q.text}
                />
              ) : (
                <div className="mt-4 space-y-2">
                  {q.options.map((o) => {
                    const checked = q.kind === "SINGLE" ? value === o : Array.isArray(value) && value.includes(o);
                    return (
                      <label
                        key={o}
                        className={cx(
                          "flex cursor-pointer items-center gap-3 rounded-[14px] border-2 px-4 py-3 text-sm font-semibold transition-colors",
                          checked ? "border-primary bg-primary-soft text-ink" : "border-line text-ink hover:bg-surface-muted",
                        )}
                      >
                        <input
                          type={q.kind === "SINGLE" ? "radio" : "checkbox"}
                          name={q.id}
                          checked={checked}
                          onChange={() => {
                            if (q.kind === "SINGLE") setValue(o);
                            else {
                              const cur = Array.isArray(value) ? value : [];
                              setValue(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
                            }
                          }}
                          className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                        />
                        {o}
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-line-subtle p-4">
          {done ? (
            <Button className="flex-1" onClick={() => setOpen(false)}>
              {t("survey.close")}
            </Button>
          ) : (
            <>
              {step < 0 ? (
                <Button variant="secondary" className="flex-1" onClick={later}>
                  {t("survey.later")}
                </Button>
              ) : (
                <Button variant="secondary" className="flex-1" disabled={pending} onClick={() => setStep(step - 1)}>
                  {t("survey.back")}
                </Button>
              )}
              <Button className="flex-1" disabled={!canGoOn} loading={pending} onClick={next}>
                {step < 0 ? t("survey.start") : last ? t("survey.submit") : t("survey.next")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
