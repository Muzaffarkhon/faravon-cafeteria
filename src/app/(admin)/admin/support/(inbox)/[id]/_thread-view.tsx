"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Badge, Button, Input, Textarea, cx } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import {
  closeThread,
  replyToThread,
  findEmployeeForLink,
  linkEmployeeToThread,
  archiveThread,
  unarchiveThread,
  deleteThread,
  purgeMessagePhoto,
  resendPromo,
} from "../../actions";
import { SUPPORT_PHOTO_ACCEPT, clipboardImage, sendSupportPhoto } from "@/lib/support-photo-client";
import type { EmployeeMatch } from "../../actions";
import { fmtDateTime } from "@/lib/dushanbe-date";

export type Msg = {
  id: string;
  direction: "IN" | "OUT";
  body: string;
  createdAt: string;
  author: string | null;
  replyTo: { id: string; direction: "IN" | "OUT"; body: string } | null;
  /** Ссылка на фото (Blob или прокси Telegram); null — фото нет. */
  image: string | null;
};

export type ActiveCoupon = {
  id: string;
  kind: "coupon" | "promo";
  /** Только у купонов: колесо подарков / за монеты (задачи, покупка) / обычный выбор. */
  source: "wheel" | "coins" | null;
  /** Только у промокодов: доставлен ли сотруднику. */
  status?: "NONE" | "DELIVERED" | "BLOCKED" | "PENDING";
  number: string; title: string; partner: string | null; validUntil: string | null };

export type QuickReply = { id: string; text: string };

function EmployeeLinkPanel({
  threadId,
  guestPhone,
  guestNameGuess,
  initialMatches,
  locale,
}: {
  threadId: string;
  guestPhone: string | null;
  guestNameGuess: string | null;
  initialMatches: EmployeeMatch[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  // Номер — только для серверного поиска (см. initialMatches), в строку не
  // подставляем — иначе он дублируется с подписью «Номер гостя» ниже. ФИО,
  // наоборот, ставим сразу в строку: гость сам его написал, это ожидаемое
  // содержимое поля поиска.
  const [query, setQuery] = useState(guestNameGuess ?? "");
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
  guestNameGuess,
  alreadyLinked,
  initialMatches,
  quickReplies,
  coupons,
  backHref,
  locale,
  onChanged,
  onListChanged,
  onBack,
}: {
  threadId: string;
  status: "OPEN" | "CLOSED";
  source: "TELEGRAM" | "WEB";
  archived: boolean;
  identityTitle: string;
  identitySubtitle: string;
  messages: Msg[];
  guestPhone: string | null;
  guestNameGuess: string | null;
  alreadyLinked: boolean;
  initialMatches: EmployeeMatch[];
  quickReplies: QuickReply[];
  coupons: ActiveCoupon[];
  /** Ссылка «‹ Назад к списку» — виден только на мобильном (там панели не рядом). */
  backHref: string;
  locale: Locale;
  /** Вызывается после действий, меняющих диалог (ответ/закрытие/архив) — живая панель перезагружает его данные. */
  onChanged?: () => void;
  /** Вызывается после действий, меняющих список (ответ/закрытие/архив/удаление) — список обновляется сразу, не дожидаясь опроса. */
  onListChanged?: () => void;
  /** Вернуться к списку диалогов — локальный переход без навигации Next.js (см. `_support-inbox-client.tsx`). */
  onBack: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [archivePending, startArchive] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; direction: "IN" | "OUT"; body: string } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [purgePending, startPurge] = useTransition();
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [couponNote, setCouponNote] = useState<string | null>(null);
  const [resending, startResend] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const quickRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function toggleArchive() {
    startArchive(async () => {
      await (archived ? unarchiveThread(threadId) : archiveThread(threadId));
      onChanged?.();
      onListChanged?.();
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
      onListChanged?.();
      onBack();
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

  // Прочитанными входящие отмечает ThreadViewLive — сразу при загрузке, вместе с
  // обновлением счётчиков (список и бейдж в меню).

  // Прокрутка к последнему сообщению: при открытии диалога — всегда, при новых
  // сообщениях — если админ и так был внизу (не дёргаем, когда он читает историю выше)
  // или это его собственный ответ.
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const lastIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const last = messages.at(-1);
    if (!el || !last || last.id === lastIdRef.current) return;
    const first = lastIdRef.current === null;
    lastIdRef.current = last.id;
    if (first || atBottomRef.current || last.direction === "OUT") {
      el.scrollTo({ top: el.scrollHeight, behavior: first ? "auto" : "smooth" });
    }
  }, [messages]);

  function flashNote(msg: string) {
    setCouponNote(msg);
    window.setTimeout(() => setCouponNote(null), 2500);
  }

  function copyCode(code: string) {
    navigator.clipboard
      .writeText(code)
      .then(() => flashNote(t("support.copied")))
      .catch(() => flashNote(code));
  }

  function insertCode(code: string) {
    setText((cur) => (cur.trim() ? `${cur.trimEnd()} ${code}` : code));
    textareaRef.current?.focus();
  }

  function resend(itemId: string) {
    startResend(async () => {
      const r = await resendPromo(itemId);
      flashNote(r.error ?? r.notice ?? t("support.resent"));
    });
  }

  function pickPhoto(file: File | null) {
    setErr(null);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(file);
    setPhotoUrl(file ? URL.createObjectURL(file) : null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function confirmPurge() {
    if (!purgeId) return;
    setPurgeError(null);
    startPurge(async () => {
      const r = await purgeMessagePhoto(purgeId);
      if (r.error) {
        setPurgeError(r.error);
        return;
      }
      setPurgeId(null);
      onChanged?.();
    });
  }

  function send() {
    setErr(null);
    if (photo) {
      start(async () => {
        const e = await sendSupportPhoto({ threadId, file: photo, caption: text, replyToId: replyingTo?.id });
        if (e) setErr(e);
        else {
          pickPhoto(null);
          setText("");
          setReplyingTo(null);
          onChanged?.();
          onListChanged?.();
        }
      });
      return;
    }
    start(async () => {
      const r = await replyToThread(threadId, text, replyingTo?.id);
      if (r.error) setErr(r.error);
      else {
        setText("");
        setReplyingTo(null);
        onChanged?.();
        onListChanged?.();
      }
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 border-b border-line bg-surface px-4 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <a
              href={backHref}
              aria-label={t("support.backToList")}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                onBack();
              }}
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted sm:hidden"
            >
              ‹
            </a>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-base font-bold leading-tight text-ink">{identityTitle}</h1>
                <Badge tone={source === "WEB" ? "accent" : "neutral"} className="shrink-0 text-[10px]">
                  {source === "WEB" ? t("support.sourceFeedback") : t("support.sourceTelegram")}
                </Badge>
              </div>
              <p className="truncate text-xs text-ink-muted">{identitySubtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {status === "OPEN" && (
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await closeThread(threadId);
                    // Закрытый диалог смотреть дальше незачем — выходим к
                    // списку, чтобы сразу выбрать следующий чат, а не читать
                    // тот же (уже закрытый) диалог второй раз.
                    onListChanged?.();
                    onBack();
                  })
                }
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
        {coupons.length > 0 && (
          <div className="rounded-xl border border-line bg-surface-muted/50 px-3 py-2">
            <button
              type="button"
              onClick={() => setCouponsOpen((v) => !v)}
              aria-expanded={couponsOpen}
              className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-ink"
            >
              <span>
                {t("support.activeCoupons")} · {coupons.length}
              </span>
              <span aria-hidden="true" className={cx("transition-transform", couponsOpen && "rotate-180")}>
                ⌄
              </span>
            </button>
            {couponsOpen && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {coupons.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface px-2.5 py-1.5 text-xs">
                    <span className="font-mono font-semibold text-ink">{c.number}</span>
                    {c.kind === "promo" && (
                      <span className="rounded-full bg-primary-soft px-1.5 text-[10px] font-semibold text-primary-strong">{t("support.promoTag")}</span>
                    )}
                    {c.source && (
                      <span className="rounded-full bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-700">
                        {c.source === "wheel" ? t("support.sourceWheel") : t("support.sourceCoins")}
                      </span>
                    )}
                    {c.kind === "promo" && c.status === "BLOCKED" && (
                      <span className="rounded-full bg-danger-soft px-1.5 text-[10px] font-semibold text-danger">{t("support.promoBlocked")}</span>
                    )}
                    {c.kind === "promo" && c.status === "PENDING" && (
                      <span className="rounded-full bg-warning-soft px-1.5 text-[10px] font-semibold text-warning-strong">{t("support.promoPending")}</span>
                    )}
                    <span className="text-ink">{c.title}</span>
                    {c.partner && <span className="text-ink-muted">{c.partner}</span>}
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      <span className="mr-1 text-ink-subtle">
                        {c.validUntil ? `${t("support.couponUntil")} ${fmtDateTime(new Date(c.validUntil))}` : t("support.couponNoLimit")}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyCode(c.number)}
                        className="rounded-full border border-line px-2 py-0.5 font-semibold text-ink-muted hover:bg-surface-muted"
                      >
                        {t("support.copy")}
                      </button>
                      <button
                        type="button"
                        onClick={() => insertCode(c.number)}
                        disabled={status === "CLOSED"}
                        className="rounded-full border border-line px-2 py-0.5 font-semibold text-ink-muted hover:bg-surface-muted disabled:opacity-40"
                      >
                        {t("support.insertToReply")}
                      </button>
                      {c.kind === "promo" && (
                        <button
                          type="button"
                          onClick={() => resend(c.id)}
                          disabled={resending}
                          className="rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary-strong hover:bg-primary-soft-hover disabled:opacity-50"
                        >
                          {t("support.resendPromo")}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {couponNote && <p className="mt-1.5 text-xs font-medium text-success-strong" role="status">{couponNote}</p>}
          </div>
        )}
        {!alreadyLinked && (
          <EmployeeLinkPanel
            threadId={threadId}
            guestPhone={guestPhone}
            guestNameGuess={guestNameGuess}
            initialMatches={initialMatches}
            locale={locale}
          />
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

      <ConfirmDialog
        open={purgeId !== null}
        title={t("support.purgePhotoTitle")}
        tone="danger"
        confirmLabel={t("support.purgePhoto")}
        busy={purgePending}
        message={
          <div className="space-y-2">
            <p>{t("support.purgePhotoMessage")}</p>
            {purgeError && (
              <p className="rounded-md bg-danger/10 p-2 text-xs font-medium text-danger" role="alert">
                {purgeError}
              </p>
            )}
          </div>
        }
        onConfirm={confirmPurge}
        onClose={() => !purgePending && setPurgeId(null)}
      />

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-2 overflow-y-auto bg-canvas p-4"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("support.noMessages")}</p>
        ) : (
          messages.map((m) => {
            const replyButton = (
              <button
                type="button"
                aria-label={t("support.replyToMessage")}
                title={t("support.replyToMessage")}
                onClick={() => {
                  setReplyingTo({ id: m.id, direction: m.direction, body: m.body });
                  textareaRef.current?.focus();
                }}
                className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-subtle opacity-0 transition-opacity hover:bg-surface-muted hover:text-ink group-hover:opacity-100"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 17 4 12l5-5M4 12h11a5 5 0 0 1 0 10h-1" />
                </svg>
              </button>
            );
            return (
              <div
                key={m.id}
                className={cx(
                  "group flex items-end gap-1",
                  m.direction === "OUT" ? "flex-row-reverse justify-start" : "justify-start",
                )}
              >
                {replyButton}
                {m.image && (
                  <button
                    type="button"
                    aria-label={t("support.purgePhoto")}
                    title={t("support.purgePhoto")}
                    onClick={() => {
                      setPurgeError(null);
                      setPurgeId(m.id);
                    }}
                    className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-subtle opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
                    </svg>
                  </button>
                )}
                <div
                  className={cx(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                    m.direction === "OUT" ? "bg-primary text-on-brand" : "bg-surface-muted text-ink",
                  )}
                >
                  {m.replyTo && (
                    <div
                      className={cx(
                        "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs",
                        m.direction === "OUT" ? "border-on-brand/50 bg-on-brand/10 text-on-brand/80" : "border-ink-subtle/50 bg-surface-sunken text-ink-muted",
                      )}
                    >
                      <p className="line-clamp-2 whitespace-pre-line">{m.replyTo.body || "📷"}</p>
                    </div>
                  )}
                  {m.image && (
                    <a href={m.image} target="_blank" rel="noopener noreferrer" className="mb-1 block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.image} alt="" loading="lazy" className="max-h-72 w-full rounded-xl object-cover" />
                    </a>
                  )}
                  {m.body && <p className="whitespace-pre-line">{m.body}</p>}
                  <p
                    className={
                      "mt-1 text-[11px] " + (m.direction === "OUT" ? "text-on-brand/70" : "text-ink-subtle")
                    }
                  >
                    {m.direction === "OUT" ? (m.author ?? "C&B") : source === "WEB" ? t("support.employee") : t("support.guest")} ·{" "}
                    {fmtDateTime(new Date(m.createdAt))}
                  </p>
                </div>
              </div>
            );
          })
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
            {replyingTo && (
              <div className="flex items-start gap-2 rounded-lg border-l-2 border-primary bg-primary-soft/60 px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-primary-strong">{t("support.replyingToLabel")}</p>
                  <p className="line-clamp-1 text-xs text-ink-muted">{replyingTo.body || "📷"}</p>
                </div>
                <button
                  type="button"
                  aria-label={t("support.cancelReply")}
                  onClick={() => setReplyingTo(null)}
                  className="shrink-0 rounded-full p-1 text-ink-subtle hover:bg-surface-muted hover:text-ink"
                >
                  ×
                </button>
              </div>
            )}
            <Textarea
              ref={textareaRef}
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
              placeholder={t("support.replyPlaceholder")}
              disabled={pending}
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
                  aria-label={t("support.removePhoto")}
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
                aria-label={t("support.attachPhoto")}
                title={t("support.attachPhoto")}
                disabled={pending}
                onClick={() => fileRef.current?.click()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary-soft text-primary-strong transition-colors hover:bg-primary-soft-hover"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m21 12-9 9a6 6 0 0 1-9-9l9-9a4 4 0 0 1 6 6l-9 9a2 2 0 0 1-3-3l8-8" />
                </svg>
              </button>
              <Button onClick={send} loading={pending} disabled={!text.trim() && !photo}>
                {t("support.send")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
