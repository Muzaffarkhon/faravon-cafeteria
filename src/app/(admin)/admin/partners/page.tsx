import Link from "next/link";
import { redirect } from "next/navigation";
import type { PartnerStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { partnerStatusLabel } from "@/lib/labels";
import { FilterChips } from "@/components/filter-chips";
import { Badge, RowId, Table, buttonClass, type BadgeTone } from "@/components/ui";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
import { DeletePartnerButton } from "./_delete-button";

const PARTNER_STATUSES: PartnerStatus[] = ["ACTIVE", "SOON", "ARCHIVED"];

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  SOON: "warning",
  ARCHIVED: "neutral",
};

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; mode?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "partners.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const sp = await searchParams;
  const status = PARTNER_STATUSES.find((s) => s === sp.status);
  const mode = (["QR", "PHONE_PROMO"] as const).find((m) => m === sp.mode);

  const partners = await db.partner.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(mode ? { deliveryMode: mode } : {}),
    },
    include: {
      _count: { select: { cards: true } },
      serviceUsers: {
        where: { roles: { has: "CONTRACTOR" } },
        select: { id: true, login: true, isActive: true },
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const lastEdits = await lastEditsFor("Partner", partners.map((p) => p.id));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">{t("partners.total")}: {partners.length}</span>
        <Link href="/admin/partners/new" className={buttonClass({ size: "sm" })}>
          {t("partners.addPartner")}
        </Link>
      </div>

      <FilterChips
        basePath="/admin/partners"
        params={sp}
        groups={[
          {
            param: "status",
            label: t("partners.statusLabel"),
            options: PARTNER_STATUSES.map((s) => ({ value: s, label: partnerStatusLabel(locale, s) })),
          },
          {
            param: "mode",
            label: t("partners.deliveryLabel"),
            options: [
              { value: "QR", label: t("partners.byQr") },
              { value: "PHONE_PROMO", label: t("partners.byPhone") },
            ],
          },
        ]}
      />

      <div className="overflow-hidden rounded-[18px] bg-surface shadow-sm">
        <Table stickyHeader>
          <thead>
            <tr>
              <th>{t("partners.colId")}</th>
              <th>{t("partners.colName")}</th>
              <th>{t("partners.colContractorAccount")}</th>
              <th>{t("partners.colCategory")}</th>
              <th>{t("partners.colDiscount")}</th>
              <th>{t("partners.colCards")}</th>
              <th>{t("partners.colStatus")}</th>
              <th>{t("partners.colLastEdit")}</th>
              <th className="text-right">{t("partners.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id}>
                <td>
                  <RowId id={p.id} seq={p.seq} />
                </td>
                <td className="font-medium text-ink">{p.name}</td>
                <td>
                  {p.serviceUsers.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {p.serviceUsers.map((u) => (
                        <Badge key={u.id} tone={u.isActive ? "success" : "warning"}>
                          {u.login} {!u.isActive && t("partners.disabledShort")}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <Link
                      href={`/admin/partners/${p.id}`}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      {t("partners.createShort")}
                    </Link>
                  )}
                </td>
                <td>{p.category ?? "—"}</td>
                <td>{p.discountType ?? "—"}</td>
                <td>{p._count.cards}</td>
                <td>
                  <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
                    {partnerStatusLabel(locale, p.status)}
                  </Badge>
                </td>
                <td className="whitespace-nowrap text-xs text-ink-muted" data-numeric>
                  {formatLastEdit(lastEdits.get(p.id), p.updatedAt)}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/partners/${p.id}`}
                      className={buttonClass({ variant: "secondary", size: "sm" })}
                    >
                      {t("partners.edit")}
                    </Link>
                    <DeletePartnerButton id={p.id} name={p.name} locale={locale} />
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
