"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Textarea } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { replyInOwnThread } from "./actions";

export type OwnThreadMsg = {
  id: string;
  direction: "IN" | "OUT";
  body: string;
  createdAt: string;
};

export function OwnThread({
  threadId,
  topic,
  status,
  messages,
  locale,
}: {
  threadId: string;
  topic: string | null;
  status: "OPEN" | "CLOSED";
  messages: OwnThreadMsg[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setErr(null);
    start(async () => {
      const r = await replyInOwnThread(threadId, text);
      if (r.error) setErr(r.error);
      else setText("");
    });
  }

  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink">{topic || t("feedback.noTopic")}</div>
        <Badge tone={status === "CLOSED" ? "neutral" : "success"}>
          {status === "CLOSED" ? t("feedback.closed") : t("feedback.open")}
        </Badge>
      </div>

      <div className="space-y-2">
        {messages.map((m) => (
          <div key={m.id} className={m.direction === "OUT" ? "flex justify-start" : "flex justify-end"}>
            <div
              className={
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm " +
                (m.direction === "OUT" ? "bg-surface-muted text-ink" : "bg-primary text-on-brand")
              }
            >
              <p className="whitespace-pre-line">{m.body}</p>
              <p className={"mt-1 text-[11px] " + (m.direction === "OUT" ? "text-ink-subtle" : "text-on-brand/70")}>
                {m.direction === "OUT" ? "C&B" : t("feedback.you")} · {new Date(m.createdAt).toLocaleString("ru-RU")}
              </p>
            </div>
          </div>
        ))}
      </div>

      {status === "OPEN" ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter — отправить, Shift+Enter — перенос строки (как в мессенджерах).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!pending && text.trim()) send();
              }
            }}
            placeholder={t("feedback.messagePlaceholder")}
            disabled={pending}
            maxLength={4000}
          />
          {err && (
            <p className="text-sm font-medium text-danger" role="alert">
              {err}
            </p>
          )}
          <Button size="sm" onClick={send} loading={pending} disabled={!text.trim()}>
            {t("feedback.send")}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-ink-subtle">{t("feedback.threadClosedHint")}</p>
      )}
    </div>
  );
}
