"use client";

import { useState, useTransition } from "react";
import { Button, Card, Textarea } from "@/components/ui";
import { createQuickReply, deleteQuickReply, updateQuickReply } from "./actions";

type QuickReply = { id: string; text: string };

function ReplyRow({ reply }: { reply: QuickReply }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(reply.text);
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    start(async () => {
      const r = await updateQuickReply(reply.id, text);
      if (r.error) setErr(r.error);
      else setEditing(false);
    });
  }

  function remove() {
    if (!confirm("Удалить этот быстрый ответ?")) return;
    start(async () => {
      await deleteQuickReply(reply.id);
    });
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl border border-line p-3">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={pending} />
        {err && (
          <p className="text-sm font-medium text-danger" role="alert">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} loading={pending} disabled={!text.trim()}>
            Сохранить
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setText(reply.text);
              setEditing(false);
            }}
          >
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
      <p className="whitespace-pre-line text-sm text-ink">{reply.text}</p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(true)}>
          Изменить
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={remove}>
          Удалить
        </Button>
      </div>
    </div>
  );
}

export function QuickRepliesManager({ replies }: { replies: QuickReply[] }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    setErr(null);
    start(async () => {
      const r = await createQuickReply(text);
      if (r.error) setErr(r.error);
      else setText("");
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Текст нового быстрого ответа…"
          disabled={pending}
        />
        {err && (
          <p className="text-sm font-medium text-danger" role="alert">
            {err}
          </p>
        )}
        <Button onClick={add} loading={pending} disabled={!text.trim()}>
          Добавить
        </Button>
      </Card>

      {replies.length === 0 ? (
        <p className="text-sm text-ink-muted">Быстрых ответов пока нет.</p>
      ) : (
        <div className="space-y-2">
          {replies.map((r) => (
            <ReplyRow key={r.id} reply={r} />
          ))}
        </div>
      )}
    </div>
  );
}
