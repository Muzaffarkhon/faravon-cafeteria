import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { loadCampaignReport, ANSWER_LABEL } from "@/lib/broadcast-report";
import { Badge, Card, Table, buttonClass } from "@/components/ui";

export default async function BroadcastCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const { id } = await params;

  const report = await loadCampaignReport(id);
  if (!report) notFound();
  const { campaign, rows } = report;
  const yes = rows.filter((r) => r.answer === "YES").length;
  const no = rows.filter((r) => r.answer === "NO").length;
  const fmt = (d: Date) => d.toLocaleString("ru-RU", { timeZone: "Asia/Dushanbe", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-5">
      <Link href="/admin/broadcast" className="text-sm font-semibold text-primary hover:underline">
        ← К рассылкам
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-ink">{campaign.title}</h1>
          <p className="text-sm text-ink-muted">Отправлено {fmt(campaign.createdAt)}</p>
        </div>
        <a href={`/admin/broadcast/${campaign.id}/export`} className={buttonClass({ size: "sm" })}>
          Выгрузить в Excel
        </a>
      </header>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone="success">Да: {yes}</Badge>
        <Badge tone="warning">Нет: {no}</Badge>
        <Badge tone="neutral">Не ответили: {rows.length - yes - no}</Badge>
      </div>

      <Card className="p-4">
        <p className="whitespace-pre-line text-sm text-ink">{campaign.text}</p>
      </Card>

      <Card className="overflow-hidden">
        <Table stickyHeader>
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Подразделение</th>
              <th>Ответ</th>
              <th>Когда</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-ink">{r.fullName}</td>
                <td className="text-ink-muted">{r.department}</td>
                <td>
                  {r.answer ? (
                    <Badge tone={r.answer === "YES" ? "success" : "warning"}>{ANSWER_LABEL[r.answer]}</Badge>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td data-numeric className="text-ink-muted">{r.answeredAt ? fmt(r.answeredAt) : ""}</td>
                <td className="text-right">
                  {r.threadId && (
                    <Link href={`/admin/support/${r.threadId}`} className="text-sm font-semibold text-primary hover:underline">
                      Чат
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
