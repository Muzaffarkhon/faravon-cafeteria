import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { EMPLOYMENT_STATUS_LABELS } from "@/lib/labels";
import { Badge, Card, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { NewServiceAccount, ServiceAccountRow } from "./_account";

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
      where: { isActive: !archiveView },
      include: { user: { select: { login: true, roles: true, isActive: true } } },
      orderBy: { fullName: "asc" },
    }),
    db.user.findMany({
      where: { employeeId: null },
      orderBy: { login: "asc" },
      include: { partner: { select: { name: true } } },
    }),
    db.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.employee.count({ where: { isActive: false } }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Пользователи и роли"
        description="Справочник сотрудников, учётные записи для входа, назначение ролей и деактивация."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={archiveView ? "/admin/users" : "/admin/users?view=archive"}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              {archiveView ? "К активным" : `Архив${archivedCount ? ` (${archivedCount})` : ""}`}
            </Link>
            {!archiveView && (
              <>
                <Link
                  href="/admin/users/import"
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  Импорт из Excel
                </Link>
                <Link href="/admin/users/new" className={buttonClass({ size: "sm" })}>
                  Добавить сотрудника
                </Link>
              </>
            )}
          </div>
        }
      />

      <section className="space-y-3">
        <SectionTitle count={employees.length}>{archiveView ? "Архив сотрудников" : "Сотрудники"}</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line-subtle text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">ФИО</th>
                <th className="px-4 py-2 font-medium">Таб. №</th>
                <th className="px-4 py-2 font-medium">Подразделение</th>
                <th className="px-4 py-2 font-medium">Телефон</th>
                <th className="px-4 py-2 font-medium">Учётная запись</th>
                <th className="px-4 py-2 font-medium">Статус</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {employees.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-surface-muted/60">
                  <td className="px-4 py-2 font-medium text-ink">{e.fullName}<div className="font-mono text-[10px] font-normal text-ink-subtle">{e.id}</div></td>
                  <td className="px-4 py-2 text-ink-muted">{e.tabNumber}</td>
                  <td className="px-4 py-2 text-ink-muted">{e.department}</td>
                  <td className="px-4 py-2 text-ink-muted">{e.phone ?? "—"}</td>
                  <td className="px-4 py-2">
                    {e.user ? (
                      <span className="text-ink">
                        {e.user.login}
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
                  <td className="px-4 py-2">
                    {e.isActive ? (
                      <Badge tone="success">{EMPLOYMENT_STATUS_LABELS[e.status]}</Badge>
                    ) : (
                      <Badge tone="muted">{EMPLOYMENT_STATUS_LABELS[e.status]}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/users/${e.id}`}
                      className={buttonClass({ variant: "secondary", size: "sm" })}
                    >
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-muted">
                    Сотрудников пока нет.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      {!archiveView && (
      <section className="space-y-3">
        <SectionTitle count={serviceUsers.length}>Служебные учётные записи</SectionTitle>
        <p className="text-sm text-ink-muted">
          Административные роли без карточки сотрудника (согласующий, HR BP, контент-менеджер и т.п.).
        </p>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line-subtle text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Логин</th>
                <th className="px-4 py-2 font-medium">Роли</th>
                <th className="px-4 py-2 font-medium">Партнёр</th>
                <th className="px-4 py-2 font-medium">Статус</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
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
              {serviceUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">
                    Служебных учётных записей нет.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <NewServiceAccount partners={partners} />
      </section>
      )}
    </div>
  );
}
