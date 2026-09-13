"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { closeThread, markThreadRead, replyToThread, findEmployeeForLink, linkEmployeeToThread } from "../actions";
import type { EmployeeMatch } from "../actions";

type Msg = {
  id: string;
  direction: "IN" | "OUT";
  body: string;
  createdAt: string;
  author: string | null;
};

type QuickReply = { id: string; text: string };

function EmployeeLinkPanel({
  threadId,
  guestPhone,
  initialMatches,
  locale,
}: {
  threadId: string;
  guestPhone: string | null;
  initialMatches: EmployeeMatch[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [query, setQuery] = useState(guestPhone ?? "");
  const [matches, setMatches] = useState(initialMatches);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, { login: string; otp: string }>>({});
  const [err, setErr] = useState<string | null>(null);

  function search() {
    setErr(null);
    start(async () => {
      const r = await findEmployeeForLink(query);
      if (r.error) setErr(r.error);
      else setMatches(r.matches ?? []);
    });
  }

  function save(employeeId: string) {
    setErr(null);
    start(async () => {
      // Номер сохраняем всегда тот, что реально пришёл от гостя — не то, что
      // сейчас в строке поиска (там может быть ФИО, если искали по имени).
      const r = await linkEmployeeToThread(threadId, employeeId, guestPhone);
      if (r.error) setErr(r.error);
      else if (r.login && r.otp) setSaved((s) => ({ ...s, [employeeId]: { login: r.login!, otp: r.otp! } }));
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm font-semibold text-ink">{t("support.findEmployee")}</span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("support.searchPlaceholder")}
          disabled={pending}
          className="h-9"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={search}
          loading={pending}
          disabled={query.trim().length < 2}
        >
          {t("support.search")}
        </Button>
      </div>
      <p className="text-xs text-ink-subtle">
        {t("support.guestNumber")} {guestPhone ?? t("support.notFound")}
        {guestPhone ? ` ${t("support.willSavePhone")}` : ` ${t("support.telegramOnly")}`}
      </p>
      {err && (
        <p className="text-sm font-medium text-danger" role="alert">
          {err}
        </p>
      )}

      {matches.length === 0 ? (
        <p className="text-xs text-ink-muted">{t("support.noMatches")}</p>
      ) : (
        <div className="space-y-1.5">
          {matches.map((m) => {
            const already = saved[m.id];
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
                <span className="text-sm font-medium text-ink">{m.fullName}</span>
                <span className="text-xs text-ink-muted">
                  {m.position} · {m.department}
                </span>
                {already ? (
                  <span className="text-xs font-medium text-success">
                    {t("support.sentPrefix")} {already.login}{t("support.sentMiddle")} {already.otp}
                  </span>
                ) : (
                  <div className="ml-auto flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    >
                      {t("support.check")}
                    </Button>
                    <Button size="sm" disabled={pending} onClick={() => save(m.id)}>
                      {t("support.savePhone")}
                    </Button>
                  </div>
                )}
                {expanded === m.id && (
                  <p className="w-full text-xs text-ink-subtle">
                    {t("support.phoneLabel")} {m.phoneNormalized ?? t("support.notSpecified")} · {t("support.telegramLabel")}{" "}
                    {m.telegramId ? t("support.alreadyLinked") : t("support.notLinked")} · {t("support.accountLabel")}{" "}
                    {m.hasUser ? t("support.exists") : t("support.willBeCreated")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ThreadView({
  threadId,
  status,
  source,
  identityTitle,
  identitySubtitle,
  messages,
  guestPhone,
  alreadyLinked,
  initialMatches,
  quickReplies,
  locale,
}: {
  threadId: string;
  status: "OPEN" | "CLOSED";
  source: "TELEGRAM" | "WEB";
  identityTitle: string;
  identitySubtitle: string;
  messages: Msg[];
  guestPhone: string | null;
  alreadyLinked: boolean;
  initialMatches: EmployeeMatch[];
  quickReplies: QuickReply[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
      <div className="sticky top-0 z-20 -mx-4 -mt-4 space-y-2 border-b border-line bg-canvas/95 px-4 pb-2 pt-2 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-bold leading-tight text-ink">{identityTitle}</h1>
            <p className="text-xs text-ink-muted">{identitySubtitle}</p>
          </div>
          {status === "OPEN" && (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => start(async () => { await closeThread(threadId); })}
            >
              {t("support.closeDialog")}
            </Button>
          )}
        </div>
        {!alreadyLinked && (
          <EmployeeLinkPanel threadId={threadId} guestPhone={guestPhone} initialMatches={initialMatches} locale={locale} />
        )}
      </div>

      <div className="space-y-2 rounded-[18px] bg-surface p-4 shadow-sm">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("support.noMessages")}</p>
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
                  {m.direction === "OUT" ? (m.author ?? "C&B") : source === "WEB" ? t("support.employee") : t("support.guest")} ·{" "}
                  {new Date(m.createdAt).toLocaleString("ru-RU")}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {status === "CLOSED" && (
        <p className="text-sm text-ink-muted">{t("support.dialogClosed")}</p>
      )}

      <div className="flex flex-col gap-2">
        {quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quickReplies.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={pending}
                onClick={() => setText(r.text)}
                className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink-muted hover:bg-surface-muted"
              >
                {r.text.length > 40 ? `${r.text.slice(0, 40)}…` : r.text}
              </button>
            ))}
          </div>
        )}
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("support.replyPlaceholder")}
          disabled={pending}
        />
        {err && (
          <p className="text-sm font-medium text-danger" role="alert">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={send} loading={pending} disabled={!text.trim()}>
            {t("support.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
