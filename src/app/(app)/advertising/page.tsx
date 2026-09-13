import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, PageHeader, RowId, SectionTitle, Table, type BadgeTone } from "@/components/ui";
import { getLocale, getTranslator } from "@/lib/i18n";
import { AdvertisingForm } from "./_form";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "brand",
};

export default async function AdvertisingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "coupons.confirm")) redirect("/");
  if (!session.user.partnerId) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();
  const STATUS_LABEL: Record<string, string> = {
    PENDING: t("advertising.statusPending"),
    APPROVED: t("advertising.statusApproved"),
    REJECTED: t("advertising.statusRejected"),
  };

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
        title={t("advertising.title")}
        description={`${t("advertising.descriptionPrefix")} «${partner.name}» ${t("advertising.descriptionSuffix")}`}
      />

      <Card className="p-6">
        <SectionTitle className="text-lg">{t("advertising.newRequest")}</SectionTitle>
        <div className="mt-4">
          <AdvertisingForm partnerName={partner.name} locale={locale} />
        </div>
      </Card>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={requests.length}>
          {t("advertising.myRequests")}
        </SectionTitle>
        {requests.length === 0 ? (
          <EmptyState>{t("advertising.empty")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("advertising.colId")}</th>
                  <th>{t("advertising.colProduct")}</th>
                  <th>{t("advertising.colApp")}</th>
                  <th>{t("advertising.colStatus")}</th>
                  <th>{t("advertising.colSubmitted")}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <RowId id={r.id} seq={r.seq} />
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
