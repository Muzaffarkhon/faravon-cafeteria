import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
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
      <h1 className="text-lg font-semibold">Профиль</h1>

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-neutral-500">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 text-base font-semibold text-red-700">Смена пароля</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Для смены укажите текущий пароль. После смены другие устройства продолжат работать до
          истечения их сессии.
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
