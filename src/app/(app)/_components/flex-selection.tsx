"use client";

import { useState, useTransition } from "react";
import { Badge, Button, cx } from "@/components/ui";
import { toggleSelection, submitSelection } from "../actions";

type Card = {
  id: string;
  title: string;
  condition: string | null;
  isActive: boolean;
  partner: string | null;
  imageUrl: string | null;
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
  const selected = new Set(selectedIds);
  const usedCount = selectedIds.length;

  function onToggle(id: string) {
    setError(null);
    setBusyId(id);
    start(async () => {
      try {
        await toggleSelection(id);
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
        await submitSelection();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink-muted" data-numeric>
          Выбрано {usedCount} из {maxSelections}
        </p>
        {windowOpen && hasSubmittable && (
          <Button onClick={onSubmit} disabled={draftCount === 0 || pending} loading={busyId === "submit"}>
            Подтвердить выбор ({draftCount})
          </Button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => {
          const isSel = selected.has(c.id);
          return (
            <li
              key={c.id}
              className={cx(
                "rounded-xl border p-4 shadow-xs transition-colors",
                !c.isActive
                  ? "border-line bg-surface-muted opacity-70"
                  : isSel
                    ? "border-primary bg-primary-soft"
                    : "border-line bg-surface",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  {c.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.imageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-md border border-line object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-[0.9375rem] font-semibold leading-snug text-balance text-ink">{c.title}</div>
                    {c.partner && <div className="mt-0.5 text-xs text-ink-subtle">{c.partner}</div>}
                  </div>
                </div>
                {!c.isActive && <Badge tone="neutral">скоро</Badge>}
              </div>
              {c.condition && <p className="mt-2 text-xs text-ink-muted">{c.condition}</p>}

              {windowOpen && c.isActive && (
                <Button
                  variant={isSel ? "danger" : "soft"}
                  onClick={() => onToggle(c.id)}
                  disabled={pending || (!isSel && usedCount >= maxSelections)}
                  loading={busyId === c.id}
                  fullWidth
                  className="mt-4"
                >
                  {isSel ? "Убрать" : "Выбрать"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
