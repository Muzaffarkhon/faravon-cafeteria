"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Textarea } from "@/components/ui";
import { closeThread, markThreadRead, replyToThread } from "../actions";

type Msg = {
  id: string;
  direction: "IN" | "OUT";
  body: string;
  createdAt: string;
  author: string | null;
};

export function ThreadView({
  threadId,
  status,
  messages,
}: {
  threadId: string;
  status: "OPEN" | "CLOSED";
  messages: Msg[];
}) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const markedRef = useRef(false);

  // Открыли диалог — отмечаем входящие прочитанными. Ref защищает от
  // повторного вызова при перерисовке в React Strict Mode.
  useEffect(() => {
    if (markedRef.current) return;
    markedRef.current = true;
    if (messages.some((m) => m.direction === "IN")) {
      void markThreadRead(threadId);
    }
  }, [threadId, messages]);

  function send() {
    setErr(null);
    start(async () => {
      const r = await replyToThread(threadId, text);
      if (r.error) setErr(r.error);
      else setText("");
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-[18px] bg-surface p-4 shadow-sm">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-muted">Сообщений пока нет.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.direction === "OUT" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm " +
                  (m.direction === "OUT" ? "bg-primary text-on-brand" : "bg-surface-muted text-ink")
                }
              >
                <p className="whitespace-pre-line">{m.body}</p>
                <p
                  className={
                    "mt-1 text-[11px] " + (m.direction === "OUT" ? "text-on-brand/70" : "text-ink-subtle")
                  }
                >
                  {m.direction === "OUT" ? (m.author ?? "C&B") : "Гость"} ·{" "}
                  {new Date(m.createdAt).toLocaleString("ru-RU")}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {status === "CLOSED" && (
        <p className="text-sm text-ink-muted">Диалог закрыт. Если гость напишет снова, он откроется сам.</p>
      )}

      <div className="flex flex-col gap-2">
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ответ гостю…"
          disabled={pending}
        />
        {err && (
          <p className="text-sm font-medium text-danger" role="alert">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={send} loading={pending} disabled={!text.trim()}>
            Отправить
          </Button>
          {status === "OPEN" && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => start(async () => { await closeThread(threadId); })}
            >
              Закрыть диалог
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
