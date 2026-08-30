"use client";

import { useState, useTransition } from "react";
import { toggleSelection, submitSelection } from "../actions";

type Card = {
  id: string;
  title: string;
  condition: string | null;
  isActive: boolean;
  partner: string | null;
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
        <p className="text-sm text-neutral-500">
          Выбрано {usedCount} из {maxSelections}
        </p>
        {windowOpen && hasSubmittable && (
          <button
            onClick={onSubmit}
            disabled={pending || draftCount === 0}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Подтвердить выбор ({draftCount})
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => {
          const isSel = selected.has(c.id);
          return (
            <li
              key={c.id}
              className={`rounded-xl border p-4 transition ${
                !c.isActive
                  ? "border-neutral-200 bg-neutral-100 opacity-60"
                  : isSel
                    ? "border-red-500 bg-red-50"
                    : "border-neutral-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{c.title}</div>
                  {c.partner && <div className="text-xs text-neutral-400">{c.partner}</div>}
                </div>
                {!c.isActive && (
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600">
                    скоро
                  </span>
                )}
              </div>
              {c.condition && <p className="mt-2 text-xs text-neutral-600">{c.condition}</p>}

              {windowOpen && c.isActive && (
                <button
                  onClick={() => onToggle(c.id)}
                  disabled={pending || (!isSel && usedCount >= maxSelections)}
                  className={`mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    isSel
                      ? "border border-red-500 text-red-600 hover:bg-red-100"
                      : "bg-neutral-900 text-white hover:bg-neutral-700"
                  }`}
                >
                  {isSel ? "Убрать" : "Выбрать"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
