import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, RowId, SectionTitle, Table, buttonClass } from "@/components/ui";
import { SmartFilterButton } from "@/components/smart-filter";
import { QuickSearch } from "@/components/quick-search";
import { parseSmartFilterParams, stringFilter, dateFilter, type SmartFilterField } from "@/lib/smart-filter";
import { AccessRowActions } from "../_row-actions";
import { getLocale, getTranslator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const fmt = (d: Date) => d.toLocaleDateString("ru-RU");

export default async function AccessEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; [key: string]: string | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "access.manage")) redirect("/");
  const t = await getTranslator();
  const locale = await getLocale();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const SMART_FIELDS: SmartFilterField[] = [
    { key: "fullName", label: "ФИО", type: "text" },
    { key: "department", label: "Подразделение", type: "text" },
    { key: "phone", label: "Телефон", type: "text" },
    {
      key: "telegram",
      label: "Telegram",
      type: "select",
      options: [
        { value: "yes", label: t("access.linked") },
        { value: "no", label: t("access.notLinkedShort") },
      ],
    },
    {
      key: "account",
      label: "Учётка",
      type: "select",
      options: [
        { value: "none", label: "без учётки" },
        { value: "neverLoggedIn", label: "есть учётка, но не входил" },
        { value: "loggedIn", label: "входил" },
      ],
    },
    { key: "lastLogin", label: "Последний вход", type: "date" },
  ];
  const smartValues = parseSmartFilterParams(sp, SMART_FIELDS);
  const smartFilters: Prisma.EmployeeWhereInput[] = [];
  const fullNameF = stringFilter(smartValues.fullName);
  if (fullNameF) smartFilters.push({ fullName: fullNameF });
  const deptF = stringFilter(smartValues.department);
  if (deptF) smartFilters.push({ department: deptF });
  const phoneF = stringFilter(smartValues.phone);
  if (phoneF) smartFilters.push({ phone: phoneF });
  if (smartValues.telegram?.v === "yes") smartFilters.push({ telegramId: { not: null } });
  if (smartValues.telegram?.v === "no") smartFilters.push({ telegramId: null });
  if (smartValues.account?.v === "none") smartFilters.push({ user: null });
  if (smartValues.account?.v === "neverLoggedIn") smartFilters.push({ user: { is: { lastLoginAt: null } } });
  if (smartValues.account?.v === "loggedIn") smartFilters.push({ user: { is: { lastLoginAt: { not: null } } } });
  const lastLoginF = dateFilter(smartValues.lastLogin);
  if (lastLoginF) smartFilters.push({ user: { is: { lastLoginAt: lastLoginF } } });

  const where: Prisma.EmployeeWhereInput = {
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { department: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
    ...(smartFilters.length ? { AND: smartFilters } : {}),
  };

  const [empTotal, employees, activeCodes] = await Promise.all([
    db.employee.count({ where }),
    db.employee.findMany({
      where,
      include: {
        user: { select: { lastLoginAt: true, mustChangePassword: true, otpExpiresAt: true } },
      },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.identificationCode.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  const codeByEmp = new Map(activeCodes.map((c) => [c.employeeId, c]));
  const pages = Math.max(1, Math.ceil(empTotal / PAGE_SIZE));
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (n > 1) p.set("page", String(n));
    const str = p.toString();
    return str ? `/admin/access/employees?${str}` : "/admin/access/employees";
  };

  return (
    <div data-wide className="space-y-5">
      <SectionTitle className="text-lg">{t("access.identificationTitle")}</SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        <QuickSearch basePath="/admin/access/employees" sp={sp} placeholder={t("access.searchPlaceholder")} />
        <SmartFilterButton
          basePath="/admin/access/employees"
          params={sp}
          fields={SMART_FIELDS}
          extraParamKeys={[]}
          presets={[{ id: "all", label: "Все записи", values: null }]}
        />
        {(q || Object.keys(sp).some((k) => k.startsWith("sf_"))) && (
          <Link href="/admin/access/employees" className="text-xs text-ink-muted hover:text-ink hover:underline">
            {t("access.reset")}
          </Link>
        )}
        <span className="ml-auto text-sm text-ink-muted">
          {t("access.employeesCount")}: {empTotal}
          {q ? ` ${t("access.byFilter")}` : ""}
        </span>
      </div>

      <Card className="overflow-hidden">
        <Table stickyHeader>
          <thead>
            <tr>
              <th>{t("access.colId")}</th>
              <th>{t("access.colEmployee")}</th>
              <th>{t("access.colDepartment")}</th>
              <th>{t("access.colPhone")}</th>
              <th>{t("access.colTelegram")}</th>
              <th>{t("access.colLogin")}</th>
              <th className="text-right">{t("access.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const code = codeByEmp.get(e.id);
              const loggedIn = !!e.user?.lastLoginAt;
              return (
                <tr key={e.id}>
                  <td>
                    <RowId id={e.id} seq={e.seq} />
                  </td>
                  <td className="font-medium text-ink">{e.fullName}</td>
                  <td>{e.department}</td>
                  <td>{e.phone ?? "—"}</td>
                  <td>
                    {e.telegramId ? (
                      <Badge tone="success">{t("access.linked")}</Badge>
                    ) : (
                      <Badge tone="neutral">{t("access.notLinkedShort")}</Badge>
                    )}
                    {code && (
                      <span className="ml-2 font-mono text-xs text-warning-strong">
                        {t("access.codeUntil")} {code.code} {t("access.codeUntilJoin")} {fmt(code.expiresAt)}
                      </span>
                    )}
                  </td>
                  <td className="text-xs text-ink-muted">
                    {loggedIn
                      ? e.user?.mustChangePassword
                        ? t("access.awaitingPasswordChange")
                        : `${t("access.loggedInOn")} ${fmt(e.user!.lastLoginAt!)}`
                      : t("access.neverLoggedIn")}
                  </td>
                  <td>
                    <AccessRowActions employeeId={e.id} linked={!!e.telegramId} locale={locale} />
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-ink-muted">
                  {q ? t("access.nothingFound") : t("access.noEmployeesYet")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">
            {t("access.pagePrefix")} {page} {t("access.pageOf")} {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                {t("access.back")}
              </Link>
            )}
            {page < pages && (
              <Link
                href={pageHref(page + 1)}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                {t("access.next")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
