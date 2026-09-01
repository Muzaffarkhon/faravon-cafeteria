"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Textarea } from "@/components/ui";
import { approveItem, rejectItem } from "./actions";

export function ReviewRow({
  itemId,
  card,
  partner,
  condition,
  submittedLabel,
  waiting,
  overdue,
}: {
  itemId: string;
  card: string;
  partner: string | null;
  condition: string | null;
  submittedLabel: string | null;
  waiting: string | null;
  overdue: boolean;
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
          <div className="text-sm font-medium text-ink">{card}</div>
          <div className="text-xs text-ink-subtle">
            {partner ?? "—"}
            {condition && ` · ${condition}`}
          </div>
          {(submittedLabel || waiting) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
              {submittedLabel && <span>Подано {submittedLabel}</span>}
              {waiting && <span>· {waiting}</span>}
              {overdue && <Badge tone="warning">просрочено SLA</Badge>}
            </div>
          )}
        </div>
        {!rejecting && (
          <div className="flex gap-2">
            <Button variant="success" size="sm" disabled={pending} onClick={() => run(() => approveItem(itemId))}>
              Одобрить
            </Button>
            <Button variant="danger" size="sm" disabled={pending} onClick={() => setRejecting(true)}>
              Отклонить
            </Button>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="mt-3 rounded-lg bg-surface-muted p-3">
          <label htmlFor={`reason-${itemId}`} className="block text-xs font-medium text-ink">
            Причина отклонения (обязательно)
          </label>
          <Textarea
            id={`reason-${itemId}`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="mt-1"
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              disabled={pending || comment.trim().length === 0}
              onClick={() => run(() => rejectItem(itemId, comment))}
            >
              Подтвердить отклонение
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => {
                setRejecting(false);
                setComment("");
                setError(null);
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
