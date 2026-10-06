import { Fragment, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, PageHeader, RowId, SectionTitle, Table, type BadgeTone } from "@/components/ui";
import { SmartFilterButton } from "@/components/smart-filter";
import { QuickSearch } from "@/components/quick-search";
import { columnWhere, filterFields } from "@/lib/smart-filter";
import type { TKey } from "@/lib/i18n/dict";
import { advertisingColumns, type AdvertisingColKey } from "./_columns";
import { getLocale, getTranslator } from "@/lib/i18n";
import { AdvertisingForm } from "./_form";
import { fmtDate } from "@/lib/dushanbe-date";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "brand",
};

export default async function AdvertisingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
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

  const sp = await searchParams;
  const cols = advertisingColumns({ t: (key) => t(key as TKey), statusLabel: (status) => STATUS_LABEL[status] ?? status });
  const SMART_FIELDS = filterFields(cols);
  const smartFilters = columnWhere(sp, cols);
  const q = (sp.q ?? "").trim();

  const [partner, requests] = await Promise.all([
    db.partner.findUnique({ where: { id: session.user.partnerId }, select: { name: true } }),
    db.advertisingRequest.findMany({
      where: {
        partnerId: session.user.partnerId,
        ...(q
          ? {
              OR: [
                { productName: { contains: q, mode: "insensitive" } },
                { productDescription: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(smartFilters.length ? { AND: smartFilters } : {}),
      },
      orderBy: { submittedAt: "desc" },
    }),
  ]);
  if (!partner) redirect("/");

  return (
    <div data-wide className="space-y-6">
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle className="text-lg" count={requests.length}>
            {t("advertising.myRequests")}
          </SectionTitle>
          <QuickSearch basePath="/advertising" sp={sp} placeholder="Продукт, описание…" />
          <SmartFilterButton
            basePath="/advertising"
            params={sp}
            fields={SMART_FIELDS}
            extraParamKeys={[]}
            presets={[{ id: "all", label: "Все записи", values: null }]}
          />
        </div>
        {requests.length === 0 ? (
          <EmptyState>{t("advertising.empty")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
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
                {requests.map((r) => {
                  const cells: Record<AdvertisingColKey, ReactNode> = {
                    id: (
                      <td>
                        <RowId id={r.id} seq={r.seq} />
                      </td>
                    ),
                    product: (
                      <td className="text-ink">
                        <div className="font-medium">{r.productName}</div>
                        <div className="text-xs text-ink-subtle line-clamp-1">{r.productDescription}</div>
                      </td>
                    ),
                    app: (
                      <td className="text-ink-muted text-xs">
                        {[r.androidUrl && "Android", r.iosUrl && "iOS"].filter(Boolean).join(" · ") || "—"}
                      </td>
                    ),
                    status: (
                      <td>
                        <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </td>
                    ),
                    submitted: (
                      <td className="text-ink-muted" data-numeric>
                        {fmtDate(r.submittedAt)}
                      </td>
                    ),
                  };
                  return (
                    <tr key={r.id}>
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
