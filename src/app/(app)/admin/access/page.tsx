import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSIONS,
  ROLE_LABELS,
  can,
} from "@/lib/rbac";
import { Badge, Card, PageHeader, RowId, SectionTitle, Table } from "@/components/ui";
import { ALL_ROLES } from "../users/roles";
import { AccessRowActions } from "./_row-actions";

const fmt = (d: Date) => d.toLocaleDateString("ru-RU");

export default async function AccessPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "access.manage")) redirect("/");

  const employees = await db.employee.findMany({
    include: {
      user: { select: { lastLoginAt: true, mustChangePassword: true, otpExpiresAt: true } },
    },
    orderBy: { fullName: "asc" },
  });
  const activeCodes = await db.identificationCode.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
  });
  const codeByEmp = new Map(activeCodes.map((c) => [c.employeeId, c]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Доступ сотрудников (Telegram / OTP)"
        description="Сотрудник идентифицируется в Telegram-боте по номеру телефона или по коду, выданному здесь. Бот выдаёт одноразовый пароль на 24 часа; при первом входе требуется смена пароля."
      />

      <section className="space-y-3">
        <SectionTitle className="text-lg">Матрица ролей и прав</SectionTitle>
        <p className="text-sm text-ink-muted">
          Какая роль к чему даёт доступ. Только просмотр: матрица зашита в коде,
          роли назначаются в разделе «Пользователи».
        </p>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line-subtle text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Право</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className="px-4 py-2 text-center font-medium whitespace-nowrap">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {ALL_PERMISSIONS.map((p) => (
                <tr key={p} className="transition-colors hover:bg-surface-muted/60">
                  <td className="px-4 py-2 text-ink">
                    {PERMISSION_LABELS[p]}
                    <span className="ml-1.5 font-mono text-[11px] text-ink-subtle">{p}</span>
                  </td>
                  {ALL_ROLES.map((r) => {
                    const allowed = (PERMISSIONS[p] as readonly string[]).includes(r);
                    return (
                      <td key={r} className="px-4 py-2 text-center">
                        {allowed ? (
                          <span className="text-success-strong" aria-label="есть доступ">
                            ✓
                          </span>
                        ) : (
                          <span className="text-ink-subtle" aria-label="нет доступа">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
