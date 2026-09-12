import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, PageHeader, RowId, Table, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage")) redirect("/");

  const threads = await db.supportThread.findMany({
    include: {
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
      <PageHeader
        title="Чат поддержки"
        description="Люди, которых бот не смог опознать при входе, и переписка с ними."
        action={
          <Link href="/admin/support/quick-replies" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Быстрые ответы
          </Link>
        }
      />

      {threads.length === 0 ? (
        <EmptyState>Пока никто не писал.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table stickyHeader>
            <thead>
              <tr>
                <th>ID</th>
                <th>Гость</th>
                <th>Последнее сообщение</th>
                <th>Статус</th>
                <th>Когда</th>
                <th className="text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {threads.map((t) => {
                const last = t.messages[0];
                const unread = t._count.messages;
                return (
                  <tr key={t.id}>
                    <td>
                      <RowId id={t.id} seq={t.seq} />
                    </td>
                    <td>
                      <span className="font-medium text-ink">Гость №{t.seq}</span>
                      {t.phone && <span className="ml-1.5 text-xs text-ink-muted">· {t.phone}</span>}
                      {unread > 0 && (
                        <Badge tone="warning" className="ml-2">
                          {unread}
                        </Badge>
                      )}
                    </td>
                    <td className="max-w-[26rem] truncate text-ink-muted">
                      {last ? `${last.direction === "OUT" ? "Вы: " : ""}${last.body}` : "—"}
                    </td>
                    <td>
                      <Badge tone={t.status === "OPEN" ? "success" : "neutral"}>
                        {t.status === "OPEN" ? "Открыт" : "Закрыт"}
                      </Badge>
                    </td>
                    <td className="text-ink-muted">
                      {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(
                        t.lastMessageAt,
                      )}
                    </td>
                    <td className="text-right">
                      <Link href={`/admin/support/${t.id}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                        Открыть
                      </Link>
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
