import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { EMPLOYMENT_STATUS_LABELS } from "@/lib/labels";
import { Badge, Card, Input, PageHeader, Table, RowId, buttonClass, cx } from "@/components/ui";
import { ServiceAccountRow } from "./_account";
import { EmployeeArchiveButton } from "./_archive-button";
import { GenerateMissingAccountsBanner } from "./_generate-accounts-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "users.manage")) redirect("/");

  const sp = await searchParams;
  const archiveView = sp.view === "archive";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

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
  };

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
    archiveView || page > 1
      ? Promise.resolve([])
      : db.user.findMany({
          where: {
            employeeId: null,
            ...(q ? { login: { contains: q, mode: "insensitive" } } : {}),
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

  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (archiveView) p.set("view", "archive");
    if (q) p.set("q", q);
    if (n > 1) p.set("page", String(n));
    const str = p.toString();
    return str ? `/admin/users?${str}` : "/admin/users";
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Пользователи и роли"
        description="Единый список: карточки сотрудников и служебные учётные записи для входа на платформу."
        action={
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
            <Link
              href={archiveView ? "/admin/users" : "/admin/users?view=archive"}
              className={cx(buttonClass({ variant: "secondary", size: "sm" }), "shrink-0")}
            >
              {archiveView ? "К активным" : `Архив${archivedCount ? ` (${archivedCount})` : ""}`}
            </Link>
            {!archiveView && (
              <>
                <a
                  href="/admin/users/export"
                  download
                  className={cx(buttonClass({ variant: "secondary", size: "sm" }), "shrink-0")}
                  title="Скачать реестр сотрудников с логинами в формате Excel"
                >
                  Экспорт в Excel
                </a>
                <Link
                  href="/admin/users/import"
                  className={cx(buttonClass({ variant: "secondary", size: "sm" }), "shrink-0")}
                >
                  Импорт из Excel
                </Link>
                <Link
                  href="/admin/users/new"
                  className={cx(buttonClass({ size: "sm" }), "shrink-0")}
                >
                  Добавить
                </Link>
              </>
            )}
          </div>
        }
      />

      {!archiveView && <GenerateMissingAccountsBanner missingCount={missingAccountsCount} />}

      <form method="get" className="flex flex-wrap items-center gap-2">
        {archiveView && <input type="hidden" name="view" value="archive" />}
        <Input
          name="q"
          defaultValue={q}
          placeholder="Поиск: ФИО, логин, подразделение"
          className="w-64 py-1.5 text-sm"
        />
        <button className={buttonClass({ variant: "secondary", size: "sm" })}>Найти</button>
        {q && (
          <Link
            href={archiveView ? "/admin/users?view=archive" : "/admin/users"}
            className="text-xs text-ink-muted hover:text-ink hover:underline"
          >
            сбросить
          </Link>
        )}
        <span className="ml-auto text-sm text-ink-muted">
          {archiveView
            ? `Архив: ${empTotal}`
            : `Сотрудников: ${empTotal}${q ? " (по фильтру)" : ""}`}
        </span>
      </form>

      <Card className="overflow-hidden">
        <Table stickyHeader>
          <thead>
            <tr>
              <th>ID</th>
              <th>Тип</th>
              <th>Учётная запись</th>
              <th>ФИО</th>
              <th>Подразделение / партнёр</th>
              <th>Статус</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>
                  <RowId id={e.id} />
                </td>
                <td>
                  <Badge tone="brand">Сотрудник</Badge>
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
                          вход отключён
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <Badge tone="warning">нет входа</Badge>
                  )}
                </td>
                <td className="font-medium text-ink">{e.fullName}</td>
                <td>{e.department}</td>
                <td>
                  {e.archivedAt ? (
                    <Badge tone="muted">
                      в архиве {new Intl.DateTimeFormat("ru-RU").format(e.archivedAt)}
                    </Badge>
                  ) : e.isActive ? (
                    <Badge tone="success">{EMPLOYMENT_STATUS_LABELS[e.status]}</Badge>
                  ) : (
                    <Badge tone="muted">{EMPLOYMENT_STATUS_LABELS[e.status]}</Badge>
                  )}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/users/${e.id}`}
                      className={buttonClass({ variant: "secondary", size: "sm" })}
                    >
                      Открыть
                    </Link>
                    <EmployeeArchiveButton id={e.id} archived={!!e.archivedAt} />
                  </div>
                </td>
              </tr>
            ))}

            {serviceUsers.map((u) => (
              <ServiceAccountRow
                key={u.id}
                user={{
                  id: u.id,
                  login: u.login,
                  roles: u.roles,
                  isActive: u.isActive,
                  partnerId: u.partnerId,
                  partnerName: u.partner?.name ?? null,
                  telegramId: u.telegramId,
                }}
                partners={partners}
              />
            ))}

            {rowsOnPage === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-ink-muted">
                  {q ? "Ничего не найдено." : archiveView ? "Архив пуст." : "Записей пока нет."}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">
            Стр. {page} из {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                Назад
              </Link>
            )}
            {page < pages && (
              <Link
                href={pageHref(page + 1)}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                Вперёд
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
