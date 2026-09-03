import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { EMPLOYMENT_STATUS_LABELS } from "@/lib/labels";
import { Badge, Card, PageHeader, Table, RowId, buttonClass, cx } from "@/components/ui";
import { ServiceAccountRow } from "./_account";
import { EmployeeArchiveButton } from "./_archive-button";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "users.manage")) redirect("/");

  const archiveView = (await searchParams).view === "archive";

  const [employees, serviceUsers, partners, archivedCount] = await Promise.all([
    db.employee.findMany({
      where: { archivedAt: archiveView ? { not: null } : null },
      include: { user: { select: { login: true, roles: true, isActive: true } } },
      orderBy: { fullName: "asc" },
    }),
    // Служебные учётки показываем только в основном списке (в архиве их нет).
    archiveView
      ? Promise.resolve([])
      : db.user.findMany({
          where: { employeeId: null },
          orderBy: { login: "asc" },
          include: { partner: { select: { name: true } } },
        }),
    db.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.employee.count({ where: { archivedAt: { not: null } } }),
  ]);

  const total = employees.length + serviceUsers.length;

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

      <p className="text-sm text-ink-muted">
        {archiveView
          ? `Архив сотрудников — ${employees.length}. Запись скрыта из основного списка, история сохранена.`
          : `Всего — ${total}: сотрудников ${employees.length}, служебных ${serviceUsers.length}.`}
      </p>

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
                }}
                partners={partners}
              />
            ))}

            {total === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-ink-muted">
                  {archiveView ? "Архив пуст." : "Записей пока нет."}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
