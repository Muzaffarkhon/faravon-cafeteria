"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, buttonClass, cx, inputClass } from "@/components/ui";
import { FilterChips } from "@/components/filter-chips";
import { FilterDropdown } from "./_filter-dropdown";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { SUPPORT_CHIP_PARAMS, type ThreadRow } from "./_thread-list-shared";

/** `ThreadRow` после JSON — даты приезжают строками, не объектами `Date`. */
type ThreadRowJSON = Omit<ThreadRow, "lastMessageAt"> & { lastMessageAt: string };

const timeFmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Dushanbe" });
const POLL_MS = 8_000;

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/**
 * Боковая панель диалогов — живёт в общем layout (`(inbox)/layout.tsx`) и
 * поэтому НЕ перемонтируется при переходе между `/admin/support` и
 * `/admin/support/<id>`: список остаётся на месте, меняется только правая
 * панель — переход между чатами бесшовный, как в мессенджере, а не как
 * переход на отдельную страницу.
 *
 * Сама опрашивает `/api/support/threads` (раз в POLL_MS + сразу при смене
 * фильтров/адреса) вместо серверного рендера — серверные layout'ы Next.js
 * не получают searchParams, а фильтры живут именно в них.
 */
export function ThreadListLive({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const sp = Object.fromEntries(searchParams.entries());
  const activeId = pathname === "/admin/support" ? undefined : pathname.split("/").pop();
  const q = (sp.q ?? "").trim();
  const status = sp.status;
  const activeFilterCount = [
    !!status,
    sp.reply === "pending",
    sp.login === "missing",
    sp.unread === "yes",
    sp.archived === "yes",
  ].filter(Boolean).length;
  const hasFilters = !!(q || activeFilterCount > 0);

  // Поле поиска — неконтролируемое (`defaultValue` + `key={q}`), значение
  // читаем из инпута прямо при сабмите: так при переходе на другой адрес
  // (другой q из URL) оно само переинициализируется через remount по key,
  // без стейта/эффекта, который бы его туда зеркалил.
  const qInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ThreadRowJSON[]>([]);
  const [loaded, setLoaded] = useState(false);
  const searchKey = searchParams.toString();

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/support/threads?${searchKey}`, { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as { rows: ThreadRowJSON[] };
      setRows(data.rows);
      setLoaded(true);
    } catch {
      // сеть подвела — подхватим на следующем опросе
    }
  }, [searchKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- подгружает список с сервера (внешний источник), а не зеркалирует проп/стейт
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const basePath = activeId ? `/admin/support/${activeId}` : "/admin/support";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v);
  const queryString = qs.toString() ? `?${qs.toString()}` : "";

  const clearHref = () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && !SUPPORT_CHIP_PARAMS.includes(k) && k !== "q") p.set(k, v);
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <Link href="/admin/support/faq" className={buttonClass({ variant: "ghost", size: "sm", className: "px-2" })}>
            {t("support.faqLink")}
          </Link>
          <Link
            href="/admin/support/quick-replies"
            className={buttonClass({ variant: "ghost", size: "sm", className: "px-2" })}
          >
            {t("support.quickRepliesLink")}
          </Link>
        </div>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = qInputRef.current?.value.trim() ?? "";
            const p = new URLSearchParams(sp);
            if (value) p.set("q", value);
            else p.delete("q");
            const s = p.toString();
            router.push(s ? `${basePath}?${s}` : basePath);
          }}
        >
          <div className="flex gap-1.5">
            <input
              key={q}
              ref={qInputRef}
              name="q"
              defaultValue={q}
              placeholder={t("support.listSearchPlaceholder")}
              className={inputClass("py-1.5 text-sm")}
            />
            <button className={buttonClass({ variant: "secondary", size: "sm", className: "shrink-0" })}>
              {t("support.find")}
            </button>
          </div>
          <FilterDropdown label={t("support.filtersLabel")} count={activeFilterCount}>
            <FilterChips
              basePath={basePath}
              params={sp}
              groups={[
                {
                  param: "status",
                  label: t("support.filterStatusLabel"),
                  options: [
                    { value: "OPEN", label: t("support.open") },
                    { value: "CLOSED", label: t("support.closed") },
                  ],
                },
                {
                  param: "reply",
                  label: t("support.filterReplyLabel"),
                  options: [{ value: "pending", label: t("support.filterReplyPending") }],
                },
                {
                  param: "login",
                  label: t("support.filterLoginLabel"),
                  options: [{ value: "missing", label: t("support.filterLoginMissing") }],
                },
                {
                  param: "unread",
                  label: t("support.filterUnreadLabel"),
                  options: [{ value: "yes", label: t("support.filterUnreadOnly") }],
                },
                {
                  param: "archived",
                  label: t("support.filterArchivedLabel"),
                  options: [{ value: "yes", label: t("support.filterArchivedOnly") }],
                },
              ]}
            />
          </FilterDropdown>
          {hasFilters && (
            <Link href={clearHref()} className="inline-block text-xs text-ink-muted hover:text-ink hover:underline">
              {t("support.reset")}
            </Link>
          )}
        </form>
        <p className="text-xs text-ink-muted">
          {t("support.totalCount")} {rows.length}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!loaded ? null : rows.length === 0 ? (
          <p className="p-4 text-center text-sm text-ink-muted">
            {hasFilters ? t("support.nothingFound") : t("support.empty")}
          </p>
        ) : (
          rows.map((r) => {
            const who =
              r.source === "WEB" ? (r.employeeFullName ?? t("support.employee")) : `${t("support.guestPrefix")}${r.seq}`;
            const active = r.id === activeId;
            const preview = r.lastMessage
              ? `${r.lastMessage.direction === "OUT" ? `${t("support.youPrefix")} ` : ""}${r.lastMessage.body}`
              : "—";
            return (
              <Link
                key={r.id}
                href={`/admin/support/${r.id}${queryString}`}
                className={cx(
                  "flex items-start gap-2.5 border-b border-line-subtle px-3 py-2.5 transition-colors",
                  active ? "bg-primary-soft" : "hover:bg-surface-sunken",
                )}
              >
                <div
                  className={cx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    r.source === "WEB" ? "bg-primary-soft text-primary-strong" : "bg-surface-sunken text-ink-muted",
                  )}
                  aria-hidden="true"
                >
                  {initials(who)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{who}</span>
                    <span className="shrink-0 text-[11px] text-ink-subtle" data-numeric>
                      {timeFmt.format(new Date(r.lastMessageAt))}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{preview}</span>
                    {r.unread > 0 && (
                      <Badge tone="warning" className="shrink-0">
                        {r.unread}
                      </Badge>
                    )}
                  </div>
                  {(r.status === "CLOSED" || r.loginMissing || r.matchedInMessageOnly || r.archived) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {r.status === "CLOSED" && (
                        <Badge tone="muted" className="text-[10px]">
                          {t("support.closed")}
                        </Badge>
                      )}
                      {r.archived && (
                        <Badge tone="muted" className="text-[10px]">
                          {t("support.badgeArchived")}
                        </Badge>
                      )}
                      {r.loginMissing && (
                        <Badge tone="accent" className="text-[10px]">
                          {t("support.badgeLoginMissing")}
                        </Badge>
                      )}
                      {r.matchedInMessageOnly && (
                        <span className="text-[10px] text-primary-strong">{t("support.matchedInChat")}</span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
