import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, RowId, Table, buttonClass } from "@/components/ui";
import { getLocale, getTranslator } from "@/lib/i18n";
import { CloseThreadButton } from "./_close-button";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage") && !can(session.roles, "feedback.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const threads = await db.supportThread.findMany({
    include: {
      employee: { select: { fullName: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: { where: { direction: "IN", readAt: null } } } },
    },
  });

  // Непрочитанные — наверх, дальше по свежести. Тредов немного, сортировка
  // в памяти проще и понятнее, чем городить это в orderBy.
  threads.sort((a, b) => {
    const unread = (b._count.messages > 0 ? 1 : 0) - (a._count.messages > 0 ? 1 : 0);
    return unread !== 0 ? unread : b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
  });

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

      {threads.length === 0 ? (
        <EmptyState>{t("support.empty")}</EmptyState>
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
              {threads.map((th) => {
                const last = th.messages[0];
                const unread = th._count.messages;
                const who =
                  th.source === "WEB"
                    ? (th.employee?.fullName ?? t("support.employee"))
                    : `${t("support.guestPrefix")}${th.seq}`;
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
                    </td>
                    <td className="max-w-[26rem] truncate text-ink-muted">
                      {last ? `${last.direction === "OUT" ? `${t("support.youPrefix")} ` : ""}${last.body}` : "—"}
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
