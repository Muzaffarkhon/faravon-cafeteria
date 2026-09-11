import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, PageHeader, RowId, SectionTitle, Table, type BadgeTone } from "@/components/ui";
import { AdvertisingForm } from "./_form";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "brand",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "На рассмотрении",
  APPROVED: "Одобрена",
  REJECTED: "Отклонена",
};

export default async function AdvertisingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "coupons.confirm")) redirect("/");
  if (!session.user.partnerId) redirect("/");

  const [partner, requests] = await Promise.all([
    db.partner.findUnique({ where: { id: session.user.partnerId }, select: { name: true } }),
    db.advertisingRequest.findMany({
      where: { partnerId: session.user.partnerId },
      orderBy: { submittedAt: "desc" },
    }),
  ]);
  if (!partner) redirect("/");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Реклама"
        description={`Заявка на размещение рекламы «${partner.name}» в кафетерии льгот. Рассматривает C&B.`}
      />

      <Card className="p-6">
        <SectionTitle className="text-lg">Новая заявка</SectionTitle>
        <div className="mt-4">
          <AdvertisingForm partnerName={partner.name} />
        </div>
      </Card>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={requests.length}>
          Мои заявки
        </SectionTitle>
        {requests.length === 0 ? (
          <EmptyState>Заявок пока нет.</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Продукт</th>
                  <th>Приложение</th>
                  <th>Статус</th>
                  <th>Подана</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <RowId id={r.id} />
                    </td>
                    <td className="text-ink">
                      <div className="font-medium">{r.productName}</div>
                      <div className="text-xs text-ink-subtle line-clamp-1">{r.productDescription}</div>
                    </td>
                    <td className="text-ink-muted text-xs">
                      {[r.androidUrl && "Android", r.iosUrl && "iOS"].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="text-ink-muted" data-numeric>
                      {r.submittedAt.toLocaleDateString("ru-RU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
