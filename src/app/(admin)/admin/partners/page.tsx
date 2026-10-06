import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { partnerStatusLabel } from "@/lib/labels";
import { SmartFilterButton } from "@/components/smart-filter";
import { QuickSearch } from "@/components/quick-search";
import { columnWhere, filterFields } from "@/lib/smart-filter";
import type { TKey } from "@/lib/i18n/dict";
import { partnerColumns, type PartnerColKey } from "./_columns";
import { Badge, RowId, Table, buttonClass, type BadgeTone } from "@/components/ui";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
import { DeletePartnerButton } from "./_delete-button";

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  SOON: "warning",
  ARCHIVED: "neutral",
};

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; mode?: string; [key: string]: string | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "partners.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const sp = await searchParams;

  const cols = partnerColumns({
    t: (key) => t(key as TKey),
    statusLabel: (status) => partnerStatusLabel(locale, status as Parameters<typeof partnerStatusLabel>[1]),
  });
  const SMART_FIELDS = filterFields(cols);
  const q = (sp.q ?? "").trim();

  const partners = await db.partner.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { discountType: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      AND: columnWhere(sp, cols),
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
    <div data-wide className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">{t("partners.total")}: {partners.length}</span>
        <div className="flex items-center gap-2">
          <QuickSearch basePath="/admin/partners" sp={sp} placeholder="Название, категория…" />
          <SmartFilterButton
            basePath="/admin/partners"
            params={sp}
            fields={SMART_FIELDS}
            extraParamKeys={[]}
            presets={[{ id: "all", label: "Все записи", values: null }]}
          />
          <Link href="/admin/partners/new" className={buttonClass({ size: "sm" })}>
            {t("partners.addPartner")}
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] bg-surface shadow-sm">
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
            {partners.map((p) => {
              const cells: Record<PartnerColKey, ReactNode> = {
                id: (
                  <td>
                    <RowId id={p.id} seq={p.seq} />
                  </td>
                ),
                name: <td className="font-medium text-ink">{p.name}</td>,
                contractor: (
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
                      <Link href={`/admin/partners/${p.id}`} className="text-xs text-primary hover:underline font-medium">
                        {t("partners.createShort")}
                      </Link>
                    )}
                  </td>
                ),
                category: <td>{p.category ?? "—"}</td>,
                discount: <td>{p.discountType ?? "—"}</td>,
                cards: <td>{p._count.cards}</td>,
                mode: <td>{p.deliveryMode === "PHONE_PROMO" ? t("partners.byPhone") : t("partners.byQr")}</td>,
                status: (
                  <td>
                    <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{partnerStatusLabel(locale, p.status)}</Badge>
                  </td>
                ),
                lastEdit: (
                  <td className="whitespace-nowrap text-xs text-ink-muted" data-numeric>
                    {formatLastEdit(lastEdits.get(p.id), p.updatedAt)}
                  </td>
                ),
                actions: (
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/partners/${p.id}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                        {t("partners.edit")}
                      </Link>
                      <DeletePartnerButton id={p.id} name={p.name} locale={locale} />
                    </div>
                  </td>
                ),
              };
              return (
                <tr key={p.id}>
                  {cols.map((c) => (
                    <Fragment key={c.key}>{cells[c.key]}</Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
