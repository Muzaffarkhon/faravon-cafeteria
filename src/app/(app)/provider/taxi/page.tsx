import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, Table, buttonClass } from "@/components/ui";
import { SmartFilterButton } from "@/components/smart-filter";
import { parseSmartFilterParams, stringFilter, dateFilter, type SmartFilterField } from "@/lib/smart-filter";
import { taxiRecipientsForPartner } from "@/lib/taxi";
import { getLocale, getTranslator } from "@/lib/i18n";
import { PromoBroadcast } from "./_broadcast";

export const dynamic = "force-dynamic";

export default async function TaxiProviderPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
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

  const locale = await getLocale();
  const t = await getTranslator();

  const sp = await searchParams;
  const SMART_FIELDS: SmartFilterField[] = [
    { key: "employee", label: "Сотрудник", type: "text" },
    { key: "department", label: "Подразделение", type: "text" },
    { key: "approvedAt", label: "Дата одобрения", type: "date" },
  ];
  const smartValues = parseSmartFilterParams(sp, SMART_FIELDS);
  const smartFilters: Prisma.ApplicationItemWhereInput[] = [];
  const employeeF = stringFilter(smartValues.employee);
  if (employeeF) smartFilters.push({ application: { is: { employee: { is: { fullName: employeeF } } } } });
  const departmentF = stringFilter(smartValues.department);
  if (departmentF) smartFilters.push({ application: { is: { employee: { is: { department: departmentF } } } } });
  const approvedAtF = dateFilter(smartValues.approvedAt);
  if (approvedAtF) smartFilters.push({ decidedAt: approvedAtF });

  const recipients = await taxiRecipientsForPartner(partnerId, smartFilters);
  const stats = {
    delivered: recipients.filter((r) => r.promoStatus === "DELIVERED").length,
    blocked: recipients.filter((r) => r.promoStatus === "BLOCKED").length,
    pending: recipients.filter((r) => r.promoStatus === "PENDING").length,
    none: recipients.filter((r) => r.promoStatus === "NONE").length,
  };

  return (
    <div data-wide className="space-y-6">
      <PageHeader
        title={t("providerTaxi.title")}
        description={`«${partner.name}»: ${t("providerTaxi.descriptionSuffix")}`}
        action={
          <div className="flex items-center gap-2">
            <SmartFilterButton
              basePath="/provider/taxi"
              params={sp}
              fields={SMART_FIELDS}
              extraParamKeys={[]}
              presets={[{ id: "all", label: "Все записи", values: null }]}
            />
            <Link href="/provider/taxi/export" className={buttonClass({ variant: "secondary", size: "sm" })}>
              {t("providerTaxi.export")}
            </Link>
          </div>
        }
      />

      <Card className="space-y-3 p-4">
        <PromoBroadcast recipients={recipients.length} locale={locale} />
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line-subtle pt-3 text-xs text-ink-muted">
          <span>
            {t("providerTaxi.delivered")}: <b className="text-ink">{stats.delivered}</b>
          </span>
          <span>
            {t("providerTaxi.blockedStat")}: <b className="text-ink">{stats.blocked}</b>
          </span>
          <span>
            {t("providerTaxi.pendingStat")}: <b className="text-ink">{stats.pending}</b>
          </span>
          <span>
            {t("providerTaxi.noneStat")}: <b className="text-ink">{stats.none}</b>
          </span>
        </div>
      </Card>

      <section className="space-y-3">
        <SectionTitle>{t("providerTaxi.approvedEmployees")} ({recipients.length})</SectionTitle>
        {recipients.length === 0 ? (
          <EmptyState>{t("providerTaxi.empty")}</EmptyState>
        ) : (
          <Card>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("providerTaxi.colEmployee")}</th>
                  <th>{t("providerTaxi.colDepartment")}</th>
                  <th>{t("providerTaxi.colPhone")}</th>
                  <th>{t("providerTaxi.colCard")}</th>
                  <th>{t("providerTaxi.colPeriod")}</th>
                  <th>{t("providerTaxi.colApproved")}</th>
                  <th>{t("providerTaxi.colPromo")}</th>
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
                          {t("providerTaxi.setByEmployee")}
                        </Badge>
                      )}
                    </td>
                    <td className="text-ink-muted">{r.card}</td>
                    <td className="text-ink-muted">{r.period}</td>
                    <td data-numeric>
                      {r.approvedAt ? r.approvedAt.toLocaleDateString("ru-RU") : "—"}
                    </td>
                    <td>
                      {r.promoStatus === "DELIVERED" && <Badge tone="success">{t("providerTaxi.delivered")}</Badge>}
                      {r.promoStatus === "BLOCKED" && (
                        <span title={t("providerTaxi.blockedHint")}>
                          <Badge tone="warning">{t("providerTaxi.statusBlocked")}</Badge>
                        </span>
                      )}
                      {r.promoStatus === "PENDING" && <Badge tone="neutral">{t("providerTaxi.statusPending")}</Badge>}
                      {r.promoStatus === "NONE" && <Badge tone="neutral">{t("providerTaxi.statusNone")}</Badge>}
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
