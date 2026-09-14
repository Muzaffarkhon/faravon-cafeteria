import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, SupportThreadStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, Input, RowId, Table, buttonClass } from "@/components/ui";
import { FilterChips, hiddenChipInputs } from "@/components/filter-chips";
import { getLocale, getTranslator } from "@/lib/i18n";
import { CloseThreadButton } from "./_close-button";

export const dynamic = "force-dynamic";

const STATUSES: SupportThreadStatus[] = ["OPEN", "CLOSED"];
const CHIP_PARAMS = ["status", "reply", "login", "unread"];

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; reply?: string; login?: string; unread?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage") && !can(session.roles, "feedback.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = STATUSES.find((s) => s === sp.status);
  const replyPending = sp.reply === "pending";
  const loginMissing = sp.login === "missing";
  const unreadOnly = sp.unread === "yes";

  const where: Prisma.SupportThreadWhereInput = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { employee: { is: { fullName: { contains: q, mode: "insensitive" } } } },
            { phone: { contains: q, mode: "insensitive" } },
            { topic: { contains: q, mode: "insensitive" } },
            // «Поиск внутри чата» — ищем и по тексту переписки, не только по
            // тому, что видно в строке списка (имя/телефон/тема).
            { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [threads, linkedEmployees] = await Promise.all([
    db.supportThread.findMany({
      where,
      include: {
        employee: { select: { fullName: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: { where: { direction: "IN", readAt: null } } } },
      },
    }),
    // Тот же признак «гостю уже отправлен логин/пароль», что и на странице
    // диалога (alreadyLinked) — гость привязан, если его Telegram уже стоит
    // в карточке сотрудника.
    db.employee.findMany({ where: { telegramId: { not: null } }, select: { telegramId: true } }),
  ]);
  const linkedTelegramIds = new Set(linkedEmployees.map((e) => e.telegramId as string));

  let rows = threads.map((th) => {
    const last = th.messages[0] as (typeof th.messages)[number] | undefined;
    const who =
      th.source === "WEB" ? (th.employee?.fullName ?? t("support.employee")) : `${t("support.guestPrefix")}${th.seq}`;
    const qLower = q.toLowerCase();
    const matchedInMessageOnly =
      !!q &&
      !who.toLowerCase().includes(qLower) &&
      !(th.phone ?? "").toLowerCase().includes(qLower) &&
      !(th.topic ?? "").toLowerCase().includes(qLower);
    return {
      th,
      last,
      who,
      unread: th._count.messages,
      pendingReply: last?.direction === "IN",
      loginMissing: th.source === "TELEGRAM" && !!th.telegramId && !linkedTelegramIds.has(th.telegramId),
      matchedInMessageOnly,
    };
  });

  if (replyPending) rows = rows.filter((r) => r.pendingReply);
  if (loginMissing) rows = rows.filter((r) => r.loginMissing);
  if (unreadOnly) rows = rows.filter((r) => r.unread > 0);

  // Непрочитанные — наверх, дальше по свежести. Тредов немного, сортировка
  // в памяти проще и понятнее, чем городить это в orderBy.
  rows.sort((a, b) => {
    const unread = (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0);
    return unread !== 0 ? unread : b.th.lastMessageAt.getTime() - a.th.lastMessageAt.getTime();
  });

  const clearHref = () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && !CHIP_PARAMS.includes(k) && k !== "q") p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/support?${qs}` : "/admin/support";
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <Link href="/admin/support/faq" className={buttonClass({ variant: "secondary", size: "sm" })}>
          {t("support.faqLink")}
        </Link>
        <Link href="/admin/support/quick-replies" className={buttonClass({ variant: "secondary", size: "sm" })}>
          {t("support.quickRepliesLink")}
        </Link>
      </div>

      <FilterChips
        basePath="/admin/support"
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
        ]}
      />

      <form method="get" className="flex flex-wrap items-center gap-2">
        {hiddenChipInputs(sp, CHIP_PARAMS)}
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("support.listSearchPlaceholder")}
          className="w-72 py-1.5 text-sm"
        />
        <button className={buttonClass({ variant: "secondary", size: "sm" })}>{t("support.find")}</button>
        {q && (
          <Link href={clearHref()} className="text-xs text-ink-muted hover:text-ink hover:underline">
            {t("support.reset")}
          </Link>
        )}
        <span className="ml-auto text-sm text-ink-muted">
          {t("support.totalCount")} {rows.length}
        </span>
      </form>

      {rows.length === 0 ? (
        <EmptyState>{q || status || replyPending || loginMissing || unreadOnly ? t("support.nothingFound") : t("support.empty")}</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table stickyHeader>
            <thead>
              <tr>
                <th>{t("support.colId")}</th>
                <th>{t("support.colSource")}</th>
                <th>{t("support.colFrom")}</th>
                <th>{t("support.colLastMessage")}</th>
                <th>{t("support.colStatus")}</th>
                <th>{t("support.colWhen")}</th>
                <th className="text-right">{t("support.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ th, last, who, unread, loginMissing: missingLogin, matchedInMessageOnly }) => {
                return (
                  <tr key={th.id}>
                    <td>
                      <RowId id={th.id} seq={th.seq} />
                    </td>
                    <td>
                      <Badge tone={th.source === "WEB" ? "brand" : "neutral"}>
                        {th.source === "WEB" ? t("support.sourceFeedback") : t("support.sourceTelegram")}
                      </Badge>
                    </td>
                    <td>
                      <span className="font-medium text-ink">{who}</span>
                      {th.source === "WEB" && th.topic && (
                        <span className="ml-1.5 text-xs text-ink-muted">· {th.topic}</span>
                      )}
                      {th.source === "TELEGRAM" && th.phone && (
                        <span className="ml-1.5 text-xs text-ink-muted">· {th.phone}</span>
                      )}
                      {unread > 0 && (
                        <Badge tone="warning" className="ml-2">
                          {unread}
                        </Badge>
                      )}
                      {missingLogin && (
                        <Badge tone="accent" className="ml-2">
                          {t("support.badgeLoginMissing")}
                        </Badge>
                      )}
                    </td>
                    <td className="max-w-[26rem] truncate text-ink-muted">
                      {last ? `${last.direction === "OUT" ? `${t("support.youPrefix")} ` : ""}${last.body}` : "—"}
                      {matchedInMessageOnly && (
                        <span className="ml-1.5 text-xs text-primary-strong">{t("support.matchedInChat")}</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={th.status === "OPEN" ? "success" : "neutral"}>
                        {th.status === "OPEN" ? t("support.open") : t("support.closed")}
                      </Badge>
                    </td>
                    <td className="text-ink-muted">
                      {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(
                        th.lastMessageAt,
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/support/${th.id}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                          {t("support.openThread")}
                        </Link>
                        {th.status === "OPEN" && <CloseThreadButton threadId={th.id} locale={locale} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
