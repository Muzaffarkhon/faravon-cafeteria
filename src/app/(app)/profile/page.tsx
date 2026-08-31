import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { Card, SectionTitle } from "@/components/ui";
import { ChangePasswordForm } from "./_form";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { user, employee } = session;

  const rows: [string, string][] = [
    ["Логин", user.login],
    ["Роли", session.roles.map((r) => ROLE_LABELS[r]).join(", ")],
  ];
  if (employee) {
    rows.unshift(
      ["ФИО", employee.fullName],
      ["Должность", employee.position],
      ["Подразделение", employee.department],
    );
    if (employee.phone) rows.push(["Телефон", employee.phone]);
    rows.push(["Telegram", employee.telegramId ? "привязан" : "не привязан"]);
  }
  if (user.lastLoginAt) {
    rows.push(["Последний вход", user.lastLoginAt.toLocaleString("ru-RU")]);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold text-ink">Профиль</h1>

      <Card className="p-5">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="space-y-1 p-5">
        <SectionTitle>Смена пароля</SectionTitle>
        <p className="pb-2 text-xs text-ink-muted">
          Для смены укажите текущий пароль. После смены другие устройства продолжат работать до
          истечения их сессии.
        </p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
