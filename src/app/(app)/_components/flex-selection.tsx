"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, cx } from "@/components/ui";
import { itemStatusLabel } from "@/lib/application-workflow";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { toggleSelection, submitSelection } from "../actions";
import { CardDetailsButton } from "./card-details";

const emptySubscribe = () => () => {};

type Card = {
  id: string;
  title: string;
  description: string | null;
  condition: string | null;
  isActive: boolean;
  partner: string | null;
  address: string | null;
  workingHours: string | null;
  discountType: string | null;
  terms: string | null;
  contactPerson: string | null;
  contacts: string | null;
  imageUrl: string | null;
  category: string | null;
  minParticipants: number;
  groupCount: number;
  /** льгота партнёра со своей системой (такси): промокод уходит на номер телефона */
  phonePromo: boolean;
  /** статус позиции, если льгота уже использована в периоде (не DRAFT) */
  lockedStatus: string | null;
};

export function FlexSelection({
  cards,
  selectedIds,
  draftCount,
  maxSelections,
  windowOpen,
  hasSubmittable,
  defaultPhone,
  locale,
}: {
  cards: Card[];
  selectedIds: string[];
  draftCount: number;
  maxSelections: number;
  windowOpen: boolean;
  hasSubmittable: boolean;
  defaultPhone: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  // Ввод номера телефона для PHONE_PROMO-льготы (id карточки, для которой открыт ввод).
  const [phoneFor, setPhoneFor] = useState<string | null>(null);
  const [phoneValue, setPhoneValue] = useState(defaultPhone);
  const selected = new Set(selectedIds);

  // Переход с баннера партнёра (#card-<id>) — подсветить и подкрутить к льготе.
  useEffect(() => {
    const known = new Set(cards.map((c) => c.id));
    const focus = () => {
      const m = /^#card-(.+)$/.exec(window.location.hash);
      const id = m?.[1];
      if (!id || !known.has(id)) return;
      document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashId(id);
      window.setTimeout(() => setFlashId(null), 2400);
    };
    focus();
    window.addEventListener("hashchange", focus);
    return () => window.removeEventListener("hashchange", focus);
  }, [cards]);
  const usedCount = selectedIds.length;
  const submitting = busyId === "submit";
  const barVisible = windowOpen && hasSubmittable && draftCount > 0;

  function onToggle(id: string, phone?: string) {
    setError(null);
    setBusyId(id);
    start(async () => {
      try {
        const r = await toggleSelection(id, phone);
        if (r?.error) setError(r.error);
        else setPhoneFor(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("flex.error"));
      } finally {
        setBusyId(null);
      }
    });
  }

  // Нажатие «Выбрать» на карточке: для PHONE_PROMO сначала спросить номер телефона.
  function onSelectClick(c: Card, isSel: boolean) {
    if (isSel) return onToggle(c.id);
    if (c.phonePromo) {
      setPhoneValue(defaultPhone);
      setPhoneFor((v) => (v === c.id ? null : c.id));
      return;
    }
    onToggle(c.id);
  }

  function onSubmit() {
    setError(null);
    setBusyId("submit");
    start(async () => {
      try {
        const r = await submitSelection();
        if (r?.error) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("flex.error"));
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {(() => {
        const renderCard = (c: Card) => {
          const isSel = selected.has(c.id);
          const atLimit = !isSel && usedCount >= maxSelections;
          return (
            <li
              key={c.id}
              id={`card-${c.id}`}
              className={cx(
                "group relative flex scroll-mt-24 flex-col overflow-hidden rounded-xl border shadow-xs",
                "transition-[border-color,box-shadow,background-color,transform] duration-200 ease-out",
                !c.isActive
                  ? "border-line bg-surface-muted opacity-70"
                  : isSel
                    ? "border-primary bg-primary-soft shadow-sm ring-1 ring-primary/25"
                    : "border-line bg-surface hover:-translate-y-0.5 hover:border-line-strong hover:shadow-sm",
                flashId === c.id && "ring-2 ring-primary ring-offset-2",
              )}
            >
              <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-surface-muted">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-primary-strong/35">
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                  </div>
                )}
                <span
                  aria-hidden={!isSel}
                  className={cx(
                    "pointer-events-none absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-on-brand shadow",
                    "transition-transform duration-200 ease-out motion-reduce:transition-none",
                    isSel ? "scale-100" : "scale-0",
                  )}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                  {!c.isActive && <Badge tone="neutral">{t("flex.soon")}</Badge>}
                  {c.minParticipants > 1 && (
                    <span className="rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                      {t("flex.groupBadge")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-col p-4">
                <div className="text-base font-semibold leading-snug text-balance text-ink">{c.title}</div>
                {c.partner && <div className="mt-0.5 text-sm text-ink-subtle">{c.partner}</div>}

                {c.phonePromo ? (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-400">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    {t("flex.promoBadge")}
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" />
                    </svg>
                    {t("flex.qrBadge")}
                  </div>
                )}

                {c.condition && (
                  <p className="mt-2 text-sm font-medium leading-6 text-ink">{c.condition}</p>
                )}

                <CardDetailsButton
                  card={{
                    title: c.title,
                    description: c.description,
                    condition: c.condition,
                    partnerName: c.partner,
                    address: c.address,
                    workingHours: c.workingHours,
                    discountType: c.discountType,
                    terms: c.terms,
                    contactPerson: c.contactPerson,
                    contacts: c.contacts,
                  }}
                  locale={locale}
                />

              {c.minParticipants > 1 &&
                (() => {
                  const done = c.groupCount >= c.minParticipants;
                  return (
                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-50/50 p-2.5 dark:bg-amber-950/20">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className={done ? "text-success-strong" : "text-amber-800 dark:text-amber-300"}>
                          {done ? t("flex.groupDiscountActive") : t("flex.groupBenefit")}
                        </span>
                        <span className="tabular-nums text-ink" data-numeric>
                          {Math.min(c.groupCount, c.minParticipants)} / {c.minParticipants}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className={cx(
                            "h-full rounded-full transition-[width] duration-300 ease-out",
                            done ? "bg-success" : "bg-amber-500",
                          )}
                          style={{
                            width: `${Math.min(100, (c.groupCount / c.minParticipants) * 100)}%`,
                          }}
                        />
                      </div>
                      {!done && (
                        <p className="mt-1 text-xs text-ink-subtle">
                          {t("flex.groupWillActivatePrefix")} {c.minParticipants} {t("flex.groupWillActivateSuffix")}
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="mt-auto">
                  {windowOpen && c.isActive && c.lockedStatus ? (
                    <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                      {c.lockedStatus === "REJECTED"
                        ? t("flex.rejectedThisPeriod")
                        : c.lockedStatus === "CANCELLED"
                          ? t("flex.cancelledThisPeriod")
                          : `${t("flex.alreadySelected")} · ${itemStatusLabel(locale, c.lockedStatus as Parameters<typeof itemStatusLabel>[1])}`}
                    </p>
                  ) : windowOpen && c.isActive ? (
                    <>
                      {!(busyId === c.id && phoneFor === c.id) && (
                        <Button
                          variant={isSel ? "secondary" : atLimit ? "ghost" : "soft"}
                          onClick={() => onSelectClick(c, isSel)}
                          disabled={pending || atLimit}
                          loading={busyId === c.id}
                          fullWidth
                          className="mt-4"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {isSel ? (
                              <>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                {t("flex.removeFromSelection")}
                              </>
                            ) : atLimit ? (
                              t("flex.limitReached")
                            ) : c.phonePromo ? (
                              <>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                                {t("flex.selectSpecifyNumber")}
                              </>
                            ) : (
                              <>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                                {t("flex.select")}
                              </>
                            )}
                          </span>
                        </Button>
                      )}

                      {phoneFor === c.id && !isSel && (
                        <div className="mt-3 rounded-lg bg-surface-muted p-3">
                          <label
                            htmlFor={`phone-${c.id}`}
                            className="text-sm font-medium text-ink-muted"
                          >
                            {t("flex.tripPromoNumberLabel")}
                          </label>
                          <input
                            id={`phone-${c.id}`}
                            type="tel"
                            inputMode="tel"
                            value={phoneValue}
                            onChange={(e) => setPhoneValue(e.target.value)}
                            placeholder="+992 XX XXX XX XX"
                            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                          />
                          <p className="mt-1 text-xs text-ink-subtle">
                            {t("flex.tripPromoHint")}
                          </p>
                          <Button
                            onClick={() => onToggle(c.id, phoneValue.trim())}
                            disabled={pending || phoneValue.trim().length < 5}
                            loading={busyId === c.id}
                            size="sm"
                            fullWidth
                            className="mt-2"
                          >
                            {t("flex.confirmNumberAndSelect")}
                          </Button>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          );
        };

        // Группировка по категории карточки. Без категории — группа «Другое» в конце.
        const groups = new Map<string, Card[]>();
        for (const c of cards) {
          const key = c.category?.trim() || "";
          const arr = groups.get(key);
          if (arr) arr.push(c);
          else groups.set(key, [c]);
        }
        const keys = [...groups.keys()].sort((a, b) => {
          if (a === "") return 1;
          if (b === "") return -1;
          return a.localeCompare(b, "ru");
        });
        const grouped = groups.size > 1;

        return grouped ? (
          <div className="space-y-6">
            {keys.map((key) => (
              <div key={key || "_"} className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  {key || t("flex.other")}
                </h4>
                <ul className="grid gap-4 sm:grid-cols-2">{groups.get(key)!.map(renderCard)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">{cards.map(renderCard)}</ul>
        );
      })()}

      {/* Неподвижная панель подтверждения — как корзина, снизу справа на десктопе, над нижним меню
          на мобильных. Рендерится порталом в <body>: внутри контента родитель с transform
          (.animate-page) создаёт containing block и fixed «падал» вниз страницы (§1). */}
      {windowOpen &&
        mounted &&
        createPortal(
          <div
            className={cx(
              "fixed inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-50 mx-auto max-w-md",
              "sm:inset-x-auto sm:right-6 sm:bottom-6 sm:mx-0 sm:max-w-none",
              "transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none",
              barVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[160%] opacity-0",
            )}
          >
            <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-strong p-2 pl-3.5 shadow-lg backdrop-blur sm:gap-3 sm:p-2.5 sm:pl-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-strong sm:h-9 sm:w-9">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                  <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink" data-numeric>
                  {draftCount} {t("flex.draftCount")}
                </div>
                <div className="text-xs text-ink-muted">{t("flex.readyForApproval")}</div>
              </div>
              <Button
                onClick={onSubmit}
                disabled={draftCount === 0 || pending}
                loading={submitting}
                size="md"
                className="ml-1 shrink-0 sm:h-12 sm:px-5 sm:text-[0.9375rem]"
              >
                {t("flex.confirmSelection")}
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
