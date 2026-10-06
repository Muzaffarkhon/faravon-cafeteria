"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Textarea } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { deletePhotoInOwnThread, replyInOwnThread } from "./actions";
import { SUPPORT_PHOTO_ACCEPT, clipboardImage, sendSupportPhoto } from "@/lib/support-photo-client";
import { fmtDateTime } from "@/lib/dushanbe-date";

export type OwnThreadMsg = {
  id: string;
  direction: "IN" | "OUT";
  body: string;
  createdAt: string;
  image: string | null;
  /** Сообщение, на которое это — ответ (цитата, как в мессенджере). */
  replyTo: { body: string; direction: "IN" | "OUT" } | null;
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
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickPhoto(file: File | null) {
    setErr(null);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(file);
    setPhotoUrl(file ? URL.createObjectURL(file) : null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function send() {
    setErr(null);
    if (photo) {
      start(async () => {
        const e = await sendSupportPhoto({ threadId, file: photo, caption: text });
        if (e) setErr(e);
        else {
          pickPhoto(null);
          setText("");
          router.refresh();
        }
      });
      return;
    }
    start(async () => {
      const r = await replyInOwnThread(threadId, text);
      if (r.error) setErr(r.error);
      else setText("");
    });
  }

  function deletePhoto(messageId: string) {
    start(async () => {
      const r = await deletePhotoInOwnThread(messageId);
      if (r.error) setErr(r.error);
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
              {m.replyTo && (
                <div
                  className={
                    "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs " +
                    (m.direction === "OUT" ? "border-ink-subtle/50 bg-surface-sunken text-ink-muted" : "border-on-brand/50 bg-on-brand/10 text-on-brand/80")
                  }
                >
                  <p className="line-clamp-2 whitespace-pre-line">{m.replyTo.body || "📷"}</p>
                </div>
              )}
              {m.image && (
                <div className="group relative mb-1">
                  <a href={m.image} target="_blank" rel="noopener noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.image} alt="" loading="lazy" className="max-h-64 w-full rounded-xl object-cover" />
                  </a>
                  <button
                    type="button"
                    onClick={() => deletePhoto(m.id)}
                    disabled={pending}
                    aria-label={t("feedback.deletePhoto")}
                    title={t("feedback.deletePhoto")}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
                    </svg>
                  </button>
                </div>
              )}
              {m.body && <p className="whitespace-pre-line">{m.body}</p>}
              <p className={"mt-1 text-[11px] " + (m.direction === "OUT" ? "text-ink-subtle" : "text-on-brand/70")}>
                {m.direction === "OUT" ? "C&B" : t("feedback.you")} · {fmtDateTime(new Date(m.createdAt))}
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
            onPaste={(e) => {
              // Скриншот из буфера (Ctrl+V) — как прикреплённое фото; обычный текст вставляется как всегда.
              const img = clipboardImage(e);
              if (img) {
                e.preventDefault();
                pickPhoto(img);
              }
            }}
            onKeyDown={(e) => {
              // Enter — отправить, Shift+Enter — перенос строки (как в мессенджерах).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!pending && (text.trim() || photo)) send();
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
          {photoUrl && (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted/50 p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
              <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{photo?.name}</span>
              <button
                type="button"
                aria-label={t("feedback.removePhoto")}
                onClick={() => pickPhoto(null)}
                disabled={pending}
                className="shrink-0 rounded-full p-1 text-ink-subtle hover:bg-surface-muted hover:text-ink"
              >
                ×
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={SUPPORT_PHOTO_ACCEPT}
              className="hidden"
              onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              aria-label={t("feedback.attachPhoto")}
              title={t("feedback.attachPhoto")}
              disabled={pending}
              onClick={() => fileRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary-soft text-primary-strong transition-colors hover:bg-primary-soft-hover"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m21 12-9 9a6 6 0 0 1-9-9l9-9a4 4 0 0 1 6 6l-9 9a2 2 0 0 1-3-3l8-8" />
              </svg>
            </button>
            <Button size="sm" onClick={send} loading={pending} disabled={!text.trim() && !photo}>
              {t("feedback.send")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-subtle">{t("feedback.threadClosedHint")}</p>
      )}
    </div>
  );
}
