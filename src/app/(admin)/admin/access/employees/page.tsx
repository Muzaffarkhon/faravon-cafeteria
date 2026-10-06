import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, RowId, SectionTitle, Table, buttonClass } from "@/components/ui";
import { SmartFilterButton } from "@/components/smart-filter";
import { QuickSearch } from "@/components/quick-search";
import { columnWhere, filterFields } from "@/lib/smart-filter";
import type { TKey } from "@/lib/i18n/dict";
import { accessEmployeeColumns, type AccessColKey } from "./_columns";
import { AccessRowActions } from "../_row-actions";
import { getLocale, getTranslator } from "@/lib/i18n";
import { fmtDate } from "@/lib/dushanbe-date";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const fmt = (d: Date) => fmtDate(d);

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

  const cols = accessEmployeeColumns({ t: (key) => t(key as TKey) });
  const SMART_FIELDS = filterFields(cols);
  const smartFilters = columnWhere(sp, cols);

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
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") p.set(k, v);
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
              {cols.map((c) => (
                <th key={c.key} className={c.className}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const code = codeByEmp.get(e.id);
              const loggedIn = !!e.user?.lastLoginAt;
              const cells: Record<AccessColKey, ReactNode> = {
                id: (
                  <td>
                    <RowId id={e.id} seq={e.seq} />
                  </td>
                ),
                employee: <td className="font-medium text-ink">{e.fullName}</td>,
                department: <td>{e.department}</td>,
                phone: <td>{e.phone ?? "—"}</td>,
                telegram: (
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
                ),
                login: (
                  <td className="text-xs text-ink-muted">
                    {loggedIn
                      ? e.user?.mustChangePassword
                        ? t("access.awaitingPasswordChange")
                        : `${t("access.loggedInOn")} ${fmt(e.user!.lastLoginAt!)}`
                      : t("access.neverLoggedIn")}
                  </td>
                ),
                actions: (
                  <td>
                    <AccessRowActions employeeId={e.id} linked={!!e.telegramId} locale={locale} />
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
            {employees.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="py-6 text-center text-ink-muted">
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
