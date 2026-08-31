import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ITEM_STATUS_LABELS } from "@/lib/application-workflow";
import { Badge, Card, CardHeader, EmptyState, type BadgeTone } from "@/components/ui";
import { CancelItemButton } from "./_cancel-button";

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  COUPON_CREATED: "accent",
  COUPON_ISSUED: "success",
  REJECTED: "brand",
  CANCELLED: "muted",
};

export default async function ApplicationsPage() {
  const session = await getSession();
  if (!session?.employee) redirect("/");

  const applications = await db.application.findMany({
    where: { employeeId: session.employee.id },
    include: {
      period: true,
      items: {
        include: { card: { include: { partner: true } }, coupon: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (applications.length === 0) {
    return <EmptyState>В этом периоде вы ещё не выбрали льготы.</EmptyState>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-ink">Мои заявки и купоны</h1>

      {applications.map((app) => (
        <Card key={app.id}>
          <CardHeader className="text-sm font-medium text-ink">
            Период: {app.period.name}
          </CardHeader>
          <ul className="divide-y divide-line-subtle">
            {app.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{item.card.title}</div>
                  <div className="text-xs text-ink-subtle">
                    {item.card.partner?.name ?? "—"}
                    {item.submittedAt &&
                      ` · подано ${item.submittedAt.toLocaleDateString("ru-RU")}`}
                  </div>
                  {item.status === "REJECTED" && item.decisionComment && (
                    <div className="mt-1 text-xs font-medium text-danger">
                      Причина: {item.decisionComment}
                    </div>
                  )}
                  {item.coupon && (
                    <div className="mt-1 text-xs text-success-strong">
                      Купон № {item.coupon.number}
                      {item.coupon.validUntil &&
                        ` · действует до ${item.coupon.validUntil.toLocaleDateString("ru-RU")}`}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[item.status] ?? "neutral"}>
                    {ITEM_STATUS_LABELS[item.status]}
                  </Badge>
                  {(item.status === "DRAFT" || item.status === "PENDING") && (
                    <CancelItemButton itemId={item.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
