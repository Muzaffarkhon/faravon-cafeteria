import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, can, type Permission } from "@/lib/rbac";
import { Badge, Card, Input, RowId, SectionTitle, Table, buttonClass } from "@/components/ui";
import { AccessRowActions } from "./_row-actions";
import { MatrixForm } from "./_matrix-form";
import { getLocale, getTranslator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const fmt = (d: Date) => d.toLocaleDateString("ru-RU");

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "access.manage")) redirect("/");
  const t = await getTranslator();
  const locale = await getLocale();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.EmployeeWhereInput = q
    ? {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { department: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      }
    : {};

  const [empTotal, employees, activeCodes, permRows] = await Promise.all([
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
    db.rolePermission.findMany({ select: { role: true, permission: true, allowed: true } }),
  ]);
  const codeByEmp = new Map(activeCodes.map((c) => [c.employeeId, c]));
  const pages = Math.max(1, Math.ceil(empTotal / PAGE_SIZE));
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (n > 1) p.set("page", String(n));
    const str = p.toString();
    return str ? `/admin/access?${str}` : "/admin/access";
  };

  // Матрица из БД + дефолты из кода для прав, по которым строк нет.
  const seen = new Set(permRows.map((r) => r.permission));
  const allowed = {} as Record<Permission, Role[]>;
  for (const p of ALL_PERMISSIONS) {
    allowed[p] = seen.has(p)
      ? permRows.filter((r) => r.permission === p && r.allowed).map((r) => r.role)
      : [...DEFAULT_PERMISSIONS[p]];
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <SectionTitle className="text-lg">{t("access.matrixTitle")}</SectionTitle>
        <p className="text-sm text-ink-muted">
          {t("access.matrixHint")}
        </p>
        <MatrixForm allowed={allowed} locale={locale} />
      </section>

      <SectionTitle className="text-lg">{t("access.identificationTitle")}</SectionTitle>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("access.searchPlaceholder")}
          className="w-64 py-1.5 text-sm"
        />
        <button className={buttonClass({ variant: "secondary", size: "sm" })}>{t("access.find")}</button>
        {q && (
          <Link href="/admin/access" className="text-xs text-ink-muted hover:text-ink hover:underline">
            {t("access.reset")}
          </Link>
        )}
        <span className="ml-auto text-sm text-ink-muted">
          {t("access.employeesCount")}: {empTotal}
          {q ? ` ${t("access.byFilter")}` : ""}
        </span>
      </form>

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
