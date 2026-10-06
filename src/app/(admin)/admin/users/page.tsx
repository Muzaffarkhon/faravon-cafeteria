import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { employmentStatusLabel } from "@/lib/labels";
import { SmartFilterButton } from "@/components/smart-filter";
import { QuickSearch } from "@/components/quick-search";
import { filterFields } from "@/lib/smart-filter";
import { EMPLOYMENT_STATUSES, employeeColumns, type UserColKey } from "@/lib/employee-columns";
import type { TKey } from "@/lib/i18n/dict";
import { buildEmployeeFilter } from "@/lib/employee-filters";
import { Badge, Card, Table, RowId, buttonClass, cx } from "@/components/ui";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
import { ServiceAccountRow } from "./_account";
import { EmployeeArchiveButton } from "./_archive-button";
import { GenerateMissingAccountsBanner } from "./_generate-accounts-button";
import { EmployeeEditButton } from "./_edit-modal";
import { RowContextMenu } from "./_row-menu";
import { ALL_ROLES } from "./roles";
import { fmtDate, fmtDateTimeShort } from "@/lib/dushanbe-date";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    page?: string;
    [key: string]: string | undefined;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "users.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const sp = await searchParams;
  const archiveView = sp.view === "archive";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  // Умный фильтр — единственный видимый контрол над таблицей: все прежние
  // чипы (роль/статус работы/Telegram) и учётка теперь его select-поля (см.
  // components/smart-filter.tsx).
  const cols = employeeColumns({
    t: (key) => t(key as TKey),
    roles: ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
    empStatuses: EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: employmentStatusLabel(locale, s) })),
  });
  const SMART_FIELDS = filterFields(cols);
  const { where: empWhere, role, acc, empStatus, tg, loginF } = buildEmployeeFilter(sp, archiveView);

  const serviceHidden = archiveView || page > 1 || !!empStatus || acc === "none";

  const [empTotal, employees, serviceUsers, partners, archivedCount, missingAccountsCount] = await Promise.all([
    db.employee.count({ where: empWhere }),
    db.employee.findMany({
      where: empWhere,
      include: { user: { select: { login: true, roles: true, isActive: true, lastLoginAt: true } } },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    serviceHidden
      ? Promise.resolve([])
      : db.user.findMany({
          where: {
            employeeId: null,
            ...(q ? { login: { contains: q, mode: "insensitive" } } : {}),
            ...(loginF ? { login: loginF } : {}),
            ...(role ? { roles: { has: role } } : {}),
            ...(acc === "active" ? { isActive: true } : {}),
            ...(acc === "off" ? { isActive: false } : {}),
            ...(acc === "neverLoggedIn" ? { lastLoginAt: null } : {}),
            ...(tg ? { telegramId: tg === "yes" ? { not: null } : null } : {}),
          },
          orderBy: { login: "asc" },
          include: { partner: { select: { name: true } } },
        }),
    db.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.employee.count({ where: { archivedAt: { not: null } } }),
    archiveView ? Promise.resolve(0) : db.employee.count({ where: { user: null, archivedAt: null } }),
  ]);

  const pages = Math.max(1, Math.ceil(empTotal / PAGE_SIZE));
  const rowsOnPage = employees.length + serviceUsers.length;
  const lastEdits = await lastEditsFor("Employee", employees.map((e) => e.id));

  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") p.set(k, v);
    if (n > 1) p.set("page", String(n));
    const str = p.toString();
    return str ? `/admin/users?${str}` : "/admin/users";
  };

  const exportQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") exportQuery.set(k, v);
  const exportHref = `/admin/users/export${exportQuery.toString() ? `?${exportQuery}` : ""}`;

  return (
    <div data-wide className="space-y-4">
      <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto">
        <Link
          href={archiveView ? "/admin/users" : "/admin/users?view=archive"}
          className={cx(buttonClass({ variant: "secondary", size: "sm" }), "shrink-0")}
        >
          {archiveView ? t("users.toActive") : `${t("users.archive")}${archivedCount ? ` (${archivedCount})` : ""}`}
        </Link>
        {!archiveView && (
          <>
            <a
              href={exportHref}
              download
              className={cx(buttonClass({ variant: "secondary", size: "sm" }), "shrink-0")}
              title={t("users.exportExcelHint")}
            >
              {t("users.exportExcel")}
            </a>
            <Link
              href="/admin/users/import"
              className={cx(buttonClass({ variant: "secondary", size: "sm" }), "shrink-0")}
            >
              {t("users.importExcel")}
            </Link>
            <Link
              href="/admin/users/new"
              className={cx(buttonClass({ size: "sm" }), "shrink-0")}
            >
              {t("users.add")}
            </Link>
          </>
        )}
      </div>

      {!archiveView && <GenerateMissingAccountsBanner missingCount={missingAccountsCount} locale={locale} />}

      <div className="flex flex-wrap items-center gap-2">
        <QuickSearch
          basePath="/admin/users"
          sp={sp}
          placeholder={t("users.searchPlaceholder")}
          preserveKeys={archiveView ? ["view"] : []}
        />
        <SmartFilterButton
          basePath={archiveView ? "/admin/users" : "/admin/users"}
          params={sp}
          fields={SMART_FIELDS}
          extraParamKeys={["view"]}
          presets={[{ id: "all", label: "Все записи", values: null }]}
        />
        {(q || Object.keys(sp).some((k) => k.startsWith("sf_"))) && (
          <Link
            href={archiveView ? "/admin/users?view=archive" : "/admin/users"}
            className="text-xs text-ink-muted hover:text-ink hover:underline"
          >
            {t("users.reset")}
          </Link>
        )}
        <span className="ml-auto text-sm text-ink-muted">
          {archiveView
            ? `${t("users.archiveCount")} ${empTotal}`
            : `${t("users.employeesCount")} ${empTotal}${q ? ` ${t("users.byFilter")}` : ""}`}
        </span>
      </div>

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
            {employees.map((e) => {
              const cells: Record<UserColKey, ReactNode> = {
                id: (
                  <td>
                    <RowId id={e.id} seq={e.seq} />
                  </td>
                ),
                type: (
                  <td>
                    <Badge tone="brand">{t("users.employee")}</Badge>
                  </td>
                ),
                account: (
                  <td>
                    {e.user ? (
                      <span>
                        <span className="font-medium text-ink">{e.user.login}</span>
                        <span className="ml-1.5 text-xs text-ink-muted">
                          ({e.user.roles.map((r) => ROLE_LABELS[r]).join(", ")})
                        </span>
                        {!e.user.isActive && (
                          <Badge tone="muted" className="ml-2">
                            {t("users.loginDisabled")}
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <Badge tone="warning">{t("users.noLogin")}</Badge>
                    )}
                  </td>
                ),
                fullName: <td className="font-medium text-ink">{e.fullName}</td>,
                phone: <td className="text-ink-muted">{e.phone ?? "—"}</td>,
                deptPartner: <td>{e.department}</td>,
                status: (
                  <td>
                    {e.archivedAt ? (
                      <Badge tone="muted">
                        {t("users.archivedOn")} {fmtDate(e.archivedAt)}
                      </Badge>
                    ) : e.isActive ? (
                      <Badge tone="success">{employmentStatusLabel(locale, e.status)}</Badge>
                    ) : (
                      <Badge tone="muted">{employmentStatusLabel(locale, e.status)}</Badge>
                    )}
                  </td>
                ),
                lastLogin: (
                  <td className="whitespace-nowrap text-xs text-ink-muted" data-numeric>
                    {e.user?.lastLoginAt ? fmtDateTimeShort(e.user.lastLoginAt) : "—"}
                  </td>
                ),
                lastEdit: (
                  <td className="whitespace-nowrap text-xs text-ink-muted" data-numeric>
                    {formatLastEdit(lastEdits.get(e.id), e.updatedAt)}
                  </td>
                ),
                actions: (
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <EmployeeEditButton id={e.id} label={t("users.open")} locale={locale} />
                      <EmployeeArchiveButton id={e.id} archived={!!e.archivedAt} locale={locale} />
                      <RowContextMenu kind="employee" id={e.id} name={e.fullName} archived={!!e.archivedAt} locale={locale} />
                    </div>
                  </td>
                ),
              };
              return (
                <tr key={e.id}>
                  {cols.map((c) => (
                    <Fragment key={c.key}>{cells[c.key]}</Fragment>
                  ))}
                </tr>
              );
            })}

            {serviceUsers.map((u) => (
              <ServiceAccountRow
                key={u.id}
                user={{
                  id: u.id,
                  seq: u.seq,
                  login: u.login,
                  roles: u.roles,
                  isActive: u.isActive,
                  partnerId: u.partnerId,
                  partnerName: u.partner?.name ?? null,
                  telegramId: u.telegramId,
                  lastLoginAt: u.lastLoginAt,
                }}
                partners={partners}
                locale={locale}
              />
            ))}

            {rowsOnPage === 0 && (
              <tr>
                <td colSpan={cols.length} className="py-6 text-center text-ink-muted">
                  {q ? t("users.nothingFound") : archiveView ? t("users.archiveEmpty") : t("users.noRecordsYet")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">
            {t("users.pagePrefix")} {page} {t("users.pageOf")} {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                {t("users.back")}
              </Link>
            )}
            {page < pages && (
              <Link
                href={pageHref(page + 1)}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                {t("users.next")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
