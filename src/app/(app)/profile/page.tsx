import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { ChangePasswordForm } from "./_form";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { user, employee } = session;

  const rows: { k: string; v: ReactNode }[] = [];
  if (employee) {
    rows.push(
      { k: "ФИО", v: employee.fullName },
      { k: "Должность", v: employee.position },
      { k: "Подразделение", v: employee.department },
    );
  }
  rows.push(
    { k: "Логин", v: <span className="font-mono">{user.login}</span> },
    { k: "Роли", v: session.roles.map((r) => ROLE_LABELS[r]).join(", ") },
  );
  if (employee?.phone) rows.push({ k: "Телефон", v: <span data-numeric>{employee.phone}</span> });
  if (employee) {
    rows.push({
      k: "Telegram",
      v: employee.telegramId ? (
        <Badge tone="success">привязан</Badge>
      ) : (
        <Badge tone="neutral">не привязан</Badge>
      ),
    });
  }
  if (user.lastLoginAt) {
    rows.push({ k: "Последний вход", v: <span data-numeric>{user.lastLoginAt.toLocaleString("ru-RU")}</span> });
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          Учётная запись
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">Профиль</h1>
      </header>

      <Card className="p-6">
        <dl className="grid gap-x-8 gap-y-3.5 text-[0.9375rem] sm:grid-cols-[170px_1fr]">
          {rows.map((r) => (
            <div key={r.k} className="contents">
              <dt className="text-ink-muted">{r.k}</dt>
              <dd className="font-medium text-ink">{r.v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-6">
        <SectionTitle className="text-lg">Смена пароля</SectionTitle>
        <p className="mt-1 max-w-prose text-sm leading-6 text-ink-muted">
          Укажите текущий пароль. После смены другие устройства продолжат работать до истечения их
          сессии.
        </p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
