import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Table, buttonClass, type BadgeTone } from "@/components/ui";

const STATUS_TONE: Record<string, BadgeTone> = { PUBLISHED: "success", DRAFT: "neutral" };
const STATUS_LABEL: Record<string, string> = { PUBLISHED: "Опубликовано", DRAFT: "Черновик" };

export default async function NewsListPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");

  const news = await db.news.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, title: true, status: true, publishedAt: true, telegramSentAt: true, createdAt: true },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink">Новости</h1>
        <Link href="/admin/news/new" className={buttonClass({ size: "sm" })}>
          Добавить новость
        </Link>
      </div>

      <div className="overflow-hidden rounded-[18px] bg-surface shadow-sm">
        <Table stickyHeader>
          <thead>
            <tr>
              <th>Заголовок</th>
              <th>Статус</th>
              <th>Опубликована</th>
              <th>В боте</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {news.map((n) => (
              <tr key={n.id}>
                <td className="font-medium text-ink">{n.title}</td>
                <td>
                  <Badge tone={STATUS_TONE[n.status] ?? "neutral"}>{STATUS_LABEL[n.status] ?? n.status}</Badge>
                </td>
                <td className="whitespace-nowrap text-xs text-ink-muted" data-numeric>
                  {n.publishedAt ? n.publishedAt.toLocaleDateString("ru-RU") : "—"}
                </td>
                <td className="whitespace-nowrap text-xs text-ink-muted" data-numeric>
                  {n.telegramSentAt ? n.telegramSentAt.toLocaleDateString("ru-RU") : "—"}
                </td>
                <td>
                  <div className="flex justify-end">
                    <Link href={`/admin/news/${n.id}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                      Открыть
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
