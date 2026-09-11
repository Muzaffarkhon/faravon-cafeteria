import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, Table, buttonClass } from "@/components/ui";
import { taxiRecipientsForPartner } from "@/lib/taxi";
import { PromoBroadcast } from "./_broadcast";

export const dynamic = "force-dynamic";

export default async function TaxiProviderPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "promo.broadcast")) redirect("/");
  const partnerId = session.user.partnerId;
  if (!partnerId) redirect("/");

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { name: true, deliveryMode: true },
  });
  if (!partner) redirect("/");
  if (partner.deliveryMode !== "PHONE_PROMO") redirect("/provider");

  const recipients = await taxiRecipientsForPartner(partnerId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Промокоды на поездки"
        description={`«${partner.name}»: одобренные сотрудники и рассылка промокодов. Наш QR не используется.`}
        action={
          <Link href="/provider/taxi/export" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Выгрузить номера (XLSX)
          </Link>
        }
      />

      <Card className="p-5">
        <SectionTitle>Рассылка промокода</SectionTitle>
        <div className="mt-3">
          <PromoBroadcast recipients={recipients.length} />
        </div>
      </Card>

      <section className="space-y-3">
        <SectionTitle>Одобренные сотрудники ({recipients.length})</SectionTitle>
        {recipients.length === 0 ? (
          <EmptyState>Пока нет одобренных заявок на поездки.</EmptyState>
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Подразделение</th>
                  <th>Телефон</th>
                  <th>Льгота</th>
                  <th>Период</th>
                  <th>Одобрено</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.itemId}>
                    <td className="font-medium text-ink">{r.employee}</td>
                    <td className="text-ink-muted">{r.department}</td>
                    <td data-numeric>
                      {r.phone || "—"}
                      {r.customPhone && (
                        <Badge tone="brand" className="ml-2">
                          указан сотрудником
                        </Badge>
                      )}
                    </td>
                    <td className="text-ink-muted">{r.card}</td>
                    <td className="text-ink-muted">{r.period}</td>
                    <td data-numeric>
                      {r.approvedAt ? r.approvedAt.toLocaleDateString("ru-RU") : "—"}
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
