import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, can, type Permission } from "@/lib/rbac";
import { Badge, Card, PageHeader, RowId, SectionTitle, Table } from "@/components/ui";
import { AccessRowActions } from "./_row-actions";
import { MatrixForm } from "./_matrix-form";

const fmt = (d: Date) => d.toLocaleDateString("ru-RU");

export default async function AccessPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "access.manage")) redirect("/");

  const [employees, activeCodes, permRows] = await Promise.all([
    db.employee.findMany({
      include: {
        user: { select: { lastLoginAt: true, mustChangePassword: true, otpExpiresAt: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    db.identificationCode.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
    }),
    db.rolePermission.findMany({ select: { role: true, permission: true, allowed: true } }),
  ]);
  const codeByEmp = new Map(activeCodes.map((c) => [c.employeeId, c]));

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
      <PageHeader
        title="Доступ сотрудников (Telegram / OTP)"
        description="Сотрудник идентифицируется в Telegram-боте по номеру телефона или по коду, выданному здесь. Бот выдаёт одноразовый пароль на 24 часа; при первом входе требуется смена пароля."
      />

      <section className="space-y-3">
        <SectionTitle className="text-lg">Матрица ролей и прав</SectionTitle>
        <p className="text-sm text-ink-muted">
          Отметьте, какая роль к чему даёт доступ, и сохраните. Изменения
          применяются сразу ко всему приложению. Роли сотрудникам назначаются
          в разделе «Пользователи».
        </p>
        <MatrixForm allowed={allowed} />
      </section>

      <SectionTitle className="text-lg">Идентификация сотрудников</SectionTitle>
      <Card className="overflow-hidden">
        <Table stickyHeader>
          <thead>
            <tr>
              <th>ID</th>
              <th>Сотрудник</th>
              <th>Подразделение</th>
              <th>Телефон</th>
              <th>Telegram</th>
              <th>Вход</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const code = codeByEmp.get(e.id);
              const loggedIn = !!e.user?.lastLoginAt;
              return (
                <tr key={e.id}>
                  <td>
                    <RowId id={e.id} />
                  </td>
                  <td className="font-medium text-ink">{e.fullName}</td>
                  <td>{e.department}</td>
                  <td>{e.phone ?? "—"}</td>
                  <td>
                    {e.telegramId ? (
                      <Badge tone="success">привязан</Badge>
                    ) : (
                      <Badge tone="neutral">нет</Badge>
                    )}
                    {code && (
                      <span className="ml-2 font-mono text-xs text-warning-strong">
                        код {code.code} до {fmt(code.expiresAt)}
                      </span>
                    )}
                  </td>
                  <td className="text-xs text-ink-muted">
                    {loggedIn
                      ? e.user?.mustChangePassword
                        ? "ожидает смены пароля"
                        : `входил ${fmt(e.user!.lastLoginAt!)}`
                      : "не входил"}
                  </td>
                  <td>
                    <AccessRowActions employeeId={e.id} linked={!!e.telegramId} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
