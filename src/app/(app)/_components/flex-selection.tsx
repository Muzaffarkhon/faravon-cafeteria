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
  const [error, setError] = useState<string | null>(null);
  const selected = new Set(selectedIds);
  const usedCount = selectedIds.length;

  function onToggle(id: string) {
    setError(null);
    start(async () => {
      try {
        await toggleSelection(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      }
    });
  }

  function onSubmit() {
    setError(null);
    start(async () => {
      try {
        await submitSelection();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
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
          <Button onClick={onSubmit} disabled={pending || draftCount === 0} size="sm">
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
                    <div className="text-sm font-medium text-ink">{c.title}</div>
                    {c.partner && <div className="text-xs text-ink-subtle">{c.partner}</div>}
                  </div>
                </div>
                {!c.isActive && <Badge tone="neutral">скоро</Badge>}
              </div>
              {c.condition && <p className="mt-2 text-xs text-ink-muted">{c.condition}</p>}

              {windowOpen && c.isActive && (
                <Button
                  variant={isSel ? "danger" : "secondary"}
                  size="sm"
                  onClick={() => onToggle(c.id)}
                  disabled={pending || (!isSel && usedCount >= maxSelections)}
                  className="mt-3 w-full"
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
