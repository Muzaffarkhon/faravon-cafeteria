"use client";

import { useState, useTransition } from "react";
import { approveItem, rejectItem } from "./actions";

export function ReviewRow({
  itemId,
  card,
  partner,
  condition,
}: {
  itemId: string;
  card: string;
  partner: string | null;
  condition: string | null;
}) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      }
    });
  }

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{card}</div>
          <div className="text-xs text-neutral-400">
            {partner ?? "—"}
            {condition && ` · ${condition}`}
          </div>
        </div>
        {!rejecting && (
          <div className="flex gap-2">
            <button
              onClick={() => run(() => approveItem(itemId))}
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Одобрить
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={pending}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Отклонить
            </button>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="mt-3 rounded-lg bg-neutral-50 p-3">
          <label className="block text-xs font-medium text-neutral-600">
            Причина отклонения (обязательно)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-red-500"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => run(() => rejectItem(itemId, comment))}
              disabled={pending}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Подтвердить отклонение
            </button>
            <button
              onClick={() => {
                setRejecting(false);
                setComment("");
                setError(null);
              }}
              disabled={pending}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}
