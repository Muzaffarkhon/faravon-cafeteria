"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import {
  closeThread,
  markThreadRead,
  replyToThread,
  findEmployeeForLink,
  linkEmployeeToThread,
  archiveThread,
  unarchiveThread,
  deleteThread,
} from "../../actions";
import type { EmployeeMatch } from "../../actions";

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
  archived,
  identityTitle,
  identitySubtitle,
  messages,
  guestPhone,
  alreadyLinked,
  initialMatches,
  quickReplies,
  backHref,
  locale,
}: {
  threadId: string;
  status: "OPEN" | "CLOSED";
  source: "TELEGRAM" | "WEB";
  archived: boolean;
  identityTitle: string;
  identitySubtitle: string;
  messages: Msg[];
  guestPhone: string | null;
  alreadyLinked: boolean;
  initialMatches: EmployeeMatch[];
  quickReplies: QuickReply[];
  /** Ссылка «‹ Назад к списку» — виден только на мобильном (там панели не рядом). */
  backHref: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [archivePending, startArchive] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const quickRef = useRef<HTMLDivElement>(null);
  const markedRef = useRef(false);

  function toggleArchive() {
    startArchive(async () => {
      await (archived ? unarchiveThread(threadId) : archiveThread(threadId));
    });
  }

  function confirmDelete() {
    setDeleteError(null);
    startDelete(async () => {
      const r = await deleteThread(threadId);
      if (r?.error) {
        setDeleteError(r.error);
        return;
      }
      router.push(backHref);
    });
  }

  // Закрыть по клику вне кнопки/списка быстрых ответов — без фонового
  // перехватчика на весь экран (он же ломал закрытие по уходу мыши: курсор
  // технически всегда оставался «внутри» такого слоя).
  useEffect(() => {
    if (!quickOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) setQuickOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [quickOpen]);

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
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 border-b border-line bg-surface px-4 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Link
              href={backHref}
              aria-label={t("support.backToList")}
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted sm:hidden"
            >
              ‹
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight text-ink">{identityTitle}</h1>
              <p className="truncate text-xs text-ink-muted">{identitySubtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {status === "OPEN" && (
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => start(async () => { await closeThread(threadId); })}
              >
                {t("support.closeDialog")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={archivePending}
              onClick={toggleArchive}
            >
              {archived ? t("support.unarchive") : t("support.archive")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={deletePending}
              onClick={() => setDeleteOpen(true)}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            >
              {t("support.deleteThread")}
            </Button>
          </div>
        </div>
        {!alreadyLinked && (
          <EmployeeLinkPanel threadId={threadId} guestPhone={guestPhone} initialMatches={initialMatches} locale={locale} />
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={t("support.deleteThreadConfirmTitle")}
        tone="danger"
        confirmLabel={t("support.deleteThread")}
        busy={deletePending}
        message={
          <div className="space-y-2">
            <p>{t("support.deleteThreadConfirmMessage")}</p>
            <p className="text-xs text-ink-subtle">{t("support.deleteThreadConfirmHint")}</p>
            {deleteError && (
              <p className="rounded-md bg-danger/10 p-2 text-xs font-medium text-danger" role="alert">
                {deleteError}
              </p>
            )}
          </div>
        }
        onConfirm={confirmDelete}
        onClose={() => !deletePending && setDeleteOpen(false)}
      />

      <div className="flex-1 space-y-2 overflow-y-auto bg-canvas p-4">
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
                  {new Date(m.createdAt).toLocaleString("ru-RU", { timeZone: "Asia/Dushanbe" })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-line bg-surface p-3">
        {status === "CLOSED" ? (
          <p className="text-sm text-ink-muted">{t("support.dialogClosed")}</p>
        ) : (
          <>
            {quickReplies.length > 0 && (
              // Свёрнутая кнопка вместо строки чипов — та же горизонтальная
              // прокрутка требовала листать по одному в большом потоке, а
              // перенос в несколько строк «съедал» половину окна чата.
              // Разворачивается списком ПОВЕРХ (не раздвигая раскладку) —
              // всё видно сразу, без прокрутки вбок. Открытие по наведению
              // (не только по клику) — на мыши это фактически одно действие
              // «навёл → выбрал», а не два клика подряд. Наведение отслеживается
              // только в пределах этого блока (кнопка + список) — увели мышь
              // отсюда, список закрывается; клик вне блока ловит useEffect выше.
              <div
                ref={quickRef}
                className="relative"
                onMouseEnter={() => setQuickOpen(true)}
                onMouseLeave={() => setQuickOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setQuickOpen((v) => !v)}
                  aria-expanded={quickOpen}
                  disabled={pending}
                  className="flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-semibold text-ink-muted hover:bg-surface-muted"
                >
                  {t("support.quickRepliesToggle")}
                  <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={quickOpen ? "rotate-180" : ""}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {quickOpen && (
                  // bottom-full (без зазора от кнопки) — иначе между кнопкой и
                  // списком была мёртвая зона в пару пикселей: мышь считалась
                  // «ушедшей» из наведённой области ровно при переходе к списку.
                  <div className="absolute bottom-full left-0 z-50 flex max-h-64 w-[min(26rem,90vw)] flex-col gap-1.5 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 pb-2.5 shadow-lg">
                    {quickReplies.map((r) => (
                      // Каждый вариант — отдельная «плашка» со своим фоном, а
                      // не просто тонкая линия между строк: на светлой теме
                      // едва заметный бордер сливался с фоном, разделения не
                      // было видно вовсе.
                      <button
                        key={r.id}
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setText(r.text);
                          setQuickOpen(false);
                        }}
                        className="block w-full rounded-lg bg-surface-muted px-2.5 py-2 text-left text-xs leading-relaxed text-ink hover:bg-primary-soft"
                      >
                        {r.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Textarea
              rows={2}
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
          </>
        )}
      </div>
    </div>
  );
}
