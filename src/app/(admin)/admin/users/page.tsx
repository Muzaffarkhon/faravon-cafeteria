import Link from "next/link";
import { redirect } from "next/navigation";
import type { EmploymentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { employmentStatusLabel } from "@/lib/labels";
import { FilterChips, hiddenChipInputs } from "@/components/filter-chips";
import { Badge, Card, Input, Table, RowId, buttonClass, cx } from "@/components/ui";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
import { ServiceAccountRow } from "./_account";
import { EmployeeArchiveButton } from "./_archive-button";
import { GenerateMissingAccountsBanner } from "./_generate-accounts-button";
import { RowContextMenu } from "./_row-menu";
import { ALL_ROLES } from "./roles";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const EMPLOYMENT_STATUSES: EmploymentStatus[] = ["ACTIVE", "PROBATION", "TERMINATED"];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    page?: string;
    role?: string;
    acc?: string;
    emp?: string;
    tg?: string;
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

  // Чипы быстрых фильтров. Значения из адреса, проверенные по списку допустимых.
  const role = ALL_ROLES.find((r) => r === sp.role);
  const acc = (["active", "off", "none"] as const).find((v) => v === sp.acc);
  const empStatus = EMPLOYMENT_STATUSES.find((s) => s === sp.emp);
  const tg = (["yes", "no"] as const).find((v) => v === sp.tg);

  const empFilters: Prisma.EmployeeWhereInput[] = [];
  if (role) empFilters.push({ user: { is: { roles: { has: role } } } });
  if (acc === "active") empFilters.push({ user: { is: { isActive: true } } });
  if (acc === "off") empFilters.push({ user: { is: { isActive: false } } });
  if (acc === "none") empFilters.push({ user: null });
  if (empStatus) empFilters.push({ status: empStatus });
  if (tg) empFilters.push({ telegramId: tg === "yes" ? { not: null } : null });

  const empWhere: Prisma.EmployeeWhereInput = {
    archivedAt: archiveView ? { not: null } : null,
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { department: { contains: q, mode: "insensitive" } },
            { user: { is: { login: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
    ...(empFilters.length ? { AND: empFilters } : {}),
  };

  // Служебные учётки — не сотрудники: у них нет статуса работы, а «без учётки»
  // для них невозможно. По таким фильтрам их просто не показываем.
  const serviceHidden = archiveView || page > 1 || !!empStatus || acc === "none";

  const [empTotal, employees, serviceUsers, partners, archivedCount, missingAccountsCount] = await Promise.all([
    db.employee.count({ where: empWhere }),
    db.employee.findMany({
      where: empWhere,
      include: { user: { select: { login: true, roles: true, isActive: true } } },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    // Служебные — их немного; показываем на первой странице основного списка.
    serviceHidden
      ? Promise.resolve([])
      : db.user.findMany({
          where: {
            employeeId: null,
            ...(q ? { login: { contains: q, mode: "insensitive" } } : {}),
            ...(role ? { roles: { has: role } } : {}),
            ...(acc === "active" ? { isActive: true } : {}),
            ...(acc === "off" ? { isActive: false } : {}),
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
    // Переход по страницам сохраняет и поиск, и выбранные чипы.
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") p.set(k, v);
    if (n > 1) p.set("page", String(n));
    const str = p.toString();
    return str ? `/admin/users?${str}` : "/admin/users";
  };

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
              href="/admin/users/export"
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

      <FilterChips
        basePath="/admin/users"
        params={sp}
        groups={[
          {
            param: "role",
            label: t("users.roleLabel"),
            options: ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
          },
          {
            param: "acc",
            label: t("users.accountLabel"),
            options: [
              { value: "active", label: t("users.accountActive") },
              { value: "off", label: t("users.accountOff") },
              { value: "none", label: t("users.accountNone") },
            ],
          },
          {
            param: "emp",
            label: t("users.workLabel"),
            options: EMPLOYMENT_STATUSES.map((s) => ({
              value: s,
              label: employmentStatusLabel(locale, s),
            })),
          },
          {
            param: "tg",
            label: t("users.telegramLabel"),
            options: [
              { value: "yes", label: t("users.telegramLinked") },
              { value: "no", label: t("users.telegramNone") },
            ],
          },
        ]}
      />

      <form method="get" className="flex flex-wrap items-center gap-2">
        {archiveView && <input type="hidden" name="view" value="archive" />}
        {hiddenChipInputs(sp, ["role", "acc", "emp", "tg"])}
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("users.searchPlaceholder")}
          className="w-64 py-1.5 text-sm"
        />
        <button className={buttonClass({ variant: "secondary", size: "sm" })}>{t("users.find")}</button>
        {q && (
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
      </form>

      <Card className="overflow-hidden">
        <Table stickyHeader>
          <thead>
            <tr>
              <th>{t("users.colId")}</th>
              <th>{t("users.colType")}</th>
              <th>{t("users.colAccount")}</th>
              <th>{t("users.colFullName")}</th>
              <th>{t("users.colPhone")}</th>
              <th>{t("users.colDeptPartner")}</th>
              <th>{t("users.colStatus")}</th>
              <th>{t("users.colLastEdit")}</th>
              <th className="text-right">{t("users.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>
                  <RowId id={e.id} seq={e.seq} />
                </td>
                <td>
                  <Badge tone="brand">{t("users.employee")}</Badge>
                </td>
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
                <td className="font-medium text-ink">{e.fullName}</td>
                <td className="text-ink-muted">{e.phone ?? "—"}</td>
                <td>{e.department}</td>
                <td>
                  {e.archivedAt ? (
                    <Badge tone="muted">
                      {t("users.archivedOn")} {new Intl.DateTimeFormat("ru-RU").format(e.archivedAt)}
                    </Badge>
                  ) : e.isActive ? (
                    <Badge tone="success">{employmentStatusLabel(locale, e.status)}</Badge>
                  ) : (
                    <Badge tone="muted">{employmentStatusLabel(locale, e.status)}</Badge>
                  )}
                </td>
                <td className="whitespace-nowrap text-xs text-ink-muted" data-numeric>
                  {formatLastEdit(lastEdits.get(e.id), e.updatedAt)}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/users/${e.id}`}
                      className={buttonClass({ variant: "secondary", size: "sm" })}
                    >
                      {t("users.open")}
                    </Link>
                    <EmployeeArchiveButton id={e.id} archived={!!e.archivedAt} locale={locale} />
                    <RowContextMenu
                      kind="employee"
                      id={e.id}
                      name={e.fullName}
                      archived={!!e.archivedAt}
                      locale={locale}
                    />
                  </div>
                </td>
              </tr>
            ))}

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
                }}
                partners={partners}
                locale={locale}
              />
            ))}

            {rowsOnPage === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-ink-muted">
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
