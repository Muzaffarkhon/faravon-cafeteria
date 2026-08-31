import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ReviewRow } from "./_row";

export default async function ReviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "applications.decide")) redirect("/");

  const pending = await db.applicationItem.findMany({
    where: { status: "PENDING" },
    include: {
      card: { include: { partner: true } },
      application: { include: { employee: true, period: true } },
    },
    orderBy: [{ submittedAt: "asc" }],
  });

  // группировка по сотруднику + период
  const groups = new Map<
    string,
    { employee: string; department: string; period: string; items: typeof pending }
  >();
  for (const item of pending) {
    const key = `${item.application.employeeId}:${item.application.periodId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        employee: item.application.employee.fullName,
        department: item.application.employee.department,
        period: item.application.period.name,
        items: [],
      });
    }
    groups.get(key)!.items.push(item);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Согласование заявок"
        description={`Позиций на рассмотрении: ${pending.length}`}
      />

      {groups.size === 0 ? (
        <EmptyState>Нет позиций, ожидающих решения.</EmptyState>
      ) : (
        [...groups.values()].map((g, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="text-sm font-medium text-ink">{g.employee}</div>
              <div className="text-xs text-ink-subtle">
                {g.department} · период: {g.period}
              </div>
            </CardHeader>
            <ul className="divide-y divide-line-subtle">
              {g.items.map((item) => (
                <ReviewRow
                  key={item.id}
                  itemId={item.id}
                  card={item.card.title}
                  partner={item.card.partner?.name ?? null}
                  condition={item.card.condition}
                />
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
