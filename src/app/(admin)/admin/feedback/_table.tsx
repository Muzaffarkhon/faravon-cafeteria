"use client";

import { useState, useTransition } from "react";
import type { FeedbackStatus } from "@prisma/client";
import { Badge, Button, Card, Textarea, type BadgeTone } from "@/components/ui";
import {
  FEEDBACK_NEXT_STATUSES,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUS_TONE,
} from "@/lib/feedback";
import { setFeedbackStatus } from "./actions";

type Row = {
  id: string;
  employee: string;
  department: string;
  topic: string | null;
  message: string;
  status: FeedbackStatus;
  adminNote: string | null;
  createdAt: string;
};

export function FeedbackTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  function apply(id: string, status: FeedbackStatus) {
    setError(null);
    setBusyId(id);
    start(async () => {
      try {
        const r = await setFeedbackStatus(id, status, notes[id]);
        if (r?.error) setError(r.error);
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      {rows.map((f) => (
        <Card key={f.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">
                {f.topic || "Без темы"}
                <span className="ml-2 font-normal text-ink-subtle">
                  · {f.employee}, {f.department}
                </span>
              </div>
              <div className="text-xs text-ink-subtle" data-numeric>
                {new Date(f.createdAt).toLocaleString("ru-RU")}
              </div>
            </div>
            <Badge tone={FEEDBACK_STATUS_TONE[f.status] as BadgeTone}>
              {FEEDBACK_STATUS_LABEL[f.status]}
            </Badge>
          </div>

          <p className="mt-2 whitespace-pre-line rounded-lg bg-surface-muted px-3 py-2 text-sm leading-6 text-ink">
            {f.message}
          </p>

          <Textarea
            rows={2}
            placeholder="Ответ / комментарий сотруднику (необязательно)"
            defaultValue={f.adminNote ?? ""}
            disabled={FEEDBACK_NEXT_STATUSES[f.status].length === 0}
            onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))}
            className="mt-2"
          />

          <div className="mt-2 flex flex-wrap gap-2">
            {FEEDBACK_NEXT_STATUSES[f.status].length === 0 ? (
              <p className="text-xs text-ink-subtle">
                Обращение закрыто — статус больше не меняется.
              </p>
            ) : (
              FEEDBACK_NEXT_STATUSES[f.status].map((st) => (
                <Button
                  key={st}
                  size="sm"
                  variant={st === "CLOSED" ? "primary" : "secondary"}
                  disabled={pending}
                  loading={busyId === f.id}
                  onClick={() => apply(f.id, st)}
                >
                  {FEEDBACK_STATUS_LABEL[st]}
                </Button>
              ))
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
