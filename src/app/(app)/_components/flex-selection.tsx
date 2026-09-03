"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge, Button, cx } from "@/components/ui";
import { ITEM_STATUS_LABELS } from "@/lib/application-workflow";
import { toggleSelection, submitSelection } from "../actions";

type Card = {
  id: string;
  title: string;
  condition: string | null;
  isActive: boolean;
  partner: string | null;
  imageUrl: string | null;
  category: string | null;
  minParticipants: number;
  groupCount: number;
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
}: {
  cards: Card[];
  selectedIds: string[];
  draftCount: number;
  maxSelections: number;
  windowOpen: boolean;
  hasSubmittable: boolean;
}) {
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
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

  function onToggle(id: string) {
    setError(null);
    setBusyId(id);
    start(async () => {
      try {
        const r = await toggleSelection(id);
        if (r?.error) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setBusyId(null);
      }
    });
  }

  function onSubmit() {
    setError(null);
    setBusyId("submit");
    start(async () => {
      try {
        const r = await submitSelection();
        if (r?.error) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <p className="text-base text-ink-muted" data-numeric>
          Выбрано{" "}
          <span className="font-semibold text-ink">
            {usedCount}
          </span>{" "}
          из {maxSelections}
        </p>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${Math.min(100, (usedCount / maxSelections) * 100)}%` }}
          />
        </div>
      </div>

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
              <div className="relative h-36 shrink-0 overflow-hidden bg-surface-muted">
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
                {!c.isActive && (
                  <Badge tone="neutral" className="absolute left-3 top-3">
                    скоро
                  </Badge>
                )}
              </div>

              <div className="flex flex-1 flex-col p-4">
                <div className="text-base font-semibold leading-snug text-balance text-ink">{c.title}</div>
                {c.partner && <div className="mt-0.5 text-sm text-ink-subtle">{c.partner}</div>}

                {c.condition && <p className="mt-2 text-sm leading-6 text-ink-muted">{c.condition}</p>}

              {c.minParticipants > 1 &&
                (() => {
                  const done = c.groupCount >= c.minParticipants;
                  return (
                    <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className={done ? "text-success-strong" : "text-ink-muted"}>
                          {done ? "Групповая скидка активна" : "Групповая скидка"}
                        </span>
                        <span className="tabular-nums text-ink" data-numeric>
                          {Math.min(c.groupCount, c.minParticipants)} / {c.minParticipants}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className={cx(
                            "h-full rounded-full transition-[width] duration-300 ease-out",
                            done ? "bg-success" : "bg-primary",
                          )}
                          style={{
                            width: `${Math.min(100, (c.groupCount / c.minParticipants) * 100)}%`,
                          }}
                        />
                      </div>
                      {!done && (
                        <p className="mt-1 text-[11px] text-ink-subtle">
                          Скидка заработает, когда льготу выберут {c.minParticipants} сотрудников.
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="mt-auto">
                  {windowOpen && c.isActive && c.lockedStatus ? (
                    <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                      {c.lockedStatus === "REJECTED"
                        ? "Отклонено в этом периоде — выберите другую льготу."
                        : c.lockedStatus === "CANCELLED"
                          ? "Отменено — выберите другую льготу."
                          : `Уже выбрано в этом периоде · ${ITEM_STATUS_LABELS[c.lockedStatus as keyof typeof ITEM_STATUS_LABELS] ?? c.lockedStatus}`}
                    </p>
                  ) : windowOpen && c.isActive ? (
                    <Button
                      variant={isSel ? "secondary" : atLimit ? "ghost" : "soft"}
                      onClick={() => onToggle(c.id)}
                      disabled={pending || atLimit}
                      loading={busyId === c.id}
                      fullWidth
                      className="mt-4"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {isSel ? (
                          <>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                            В выборе — убрать
                          </>
                        ) : atLimit ? (
                          "Лимит исчерпан"
                        ) : (
                          <>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                            Выбрать
                          </>
                        )}
                      </span>
                    </Button>
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
                  {key || "Другое"}
                </h4>
                <ul className="grid gap-4 sm:grid-cols-2">{groups.get(key)!.map(renderCard)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">{cards.map(renderCard)}</ul>
        );
      })()}

      {/* Неподвижная панель подтверждения — как корзина, снизу справа. */}
      {windowOpen && (
        <div
          className={cx(
            "fixed inset-x-4 bottom-4 z-40 sm:inset-x-auto sm:right-6 sm:bottom-6",
            "transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none",
            barVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[160%] opacity-0",
          )}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-strong p-2.5 pl-4 shadow-lg backdrop-blur">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-strong">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink" data-numeric>
                {draftCount} в черновике
              </div>
              <div className="text-xs text-ink-muted">Готово к согласованию</div>
            </div>
            <Button
              onClick={onSubmit}
              disabled={draftCount === 0 || pending}
              loading={submitting}
              size="lg"
              className="ml-1 shrink-0"
            >
              Подтвердить выбор
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
