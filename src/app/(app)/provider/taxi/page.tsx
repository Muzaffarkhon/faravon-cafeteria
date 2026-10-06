import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, Table, buttonClass } from "@/components/ui";
import { SmartFilterButton } from "@/components/smart-filter";
import { QuickSearch } from "@/components/quick-search";
import { filterFields } from "@/lib/smart-filter";
import { taxiColumns, type TaxiColKey } from "@/lib/taxi-columns";
import type { TKey } from "@/lib/i18n/dict";
import { taxiRecipientsForPartner, buildTaxiSmartFilters } from "@/lib/taxi";
import { getLocale, getTranslator } from "@/lib/i18n";
import { PromoBroadcast } from "./_broadcast";
import { SinglePromoCell } from "./_single-promo";
import { fmtDate } from "@/lib/dushanbe-date";

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
  const cols = taxiColumns({ t: (key) => t(key as TKey) });
  const SMART_FIELDS = filterFields(cols);
  const smartFilters = buildTaxiSmartFilters(sp);
  const recipients = await taxiRecipientsForPartner(partnerId, smartFilters);

  const exportQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) exportQuery.set(k, v);
  const exportHref = `/provider/taxi/export${exportQuery.toString() ? `?${exportQuery}` : ""}`;
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
            <QuickSearch basePath="/provider/taxi" sp={sp} placeholder="Сотрудник, льгота…" />
            <SmartFilterButton
              basePath="/provider/taxi"
              params={sp}
              fields={SMART_FIELDS}
              extraParamKeys={[]}
              presets={[{ id: "all", label: "Все записи", values: null }]}
            />
            <Link href={exportHref} className={buttonClass({ variant: "secondary", size: "sm" })}>
              {t("providerTaxi.export")}
            </Link>
          </div>
        }
      />

      <Card className="space-y-3 p-4">
        <PromoBroadcast recipients={recipients.length} locale={locale} exportHref={exportHref} />
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
                  {cols.map((c) => (
                    <th key={c.key} className={c.className}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => {
                  const cells: Record<TaxiColKey, ReactNode> = {
                    employee: <td className="font-medium text-ink">{r.employee}</td>,
                    department: <td className="text-ink-muted">{r.department}</td>,
                    phone: (
                      <td data-numeric>
                        {r.phone || "—"}
                        {r.customPhone && (
                          <Badge tone="brand" className="ml-2">
                            {t("providerTaxi.setByEmployee")}
                          </Badge>
                        )}
                      </td>
                    ),
                    card: <td className="text-ink-muted">{r.card}</td>,
                    period: <td className="text-ink-muted">{r.period}</td>,
                    approved: <td data-numeric>{r.approvedAt ? fmtDate(r.approvedAt) : "—"}</td>,
                    promo: (
                      <td>
                        <SinglePromoCell itemId={r.itemId} initialPromo={r.promo} status={r.promoStatus} locale={locale} />
                      </td>
                    ),
                  };
                  return (
                    <tr key={r.itemId}>
                      {cols.map((c) => (
                        <Fragment key={c.key}>{cells[c.key]}</Fragment>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
