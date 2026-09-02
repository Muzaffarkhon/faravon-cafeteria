import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";
import { Card, SectionTitle } from "@/components/ui";
import { ChangePasswordForm } from "./_form";
import { RevokeSessionsButton } from "./_sessions";

const shortUa = (ua: string | null) => {
  if (!ua) return "—";
  const m = /(Chrome|Firefox|Safari|Edg|YaBrowser|OPR)\/[\d.]+/.exec(ua);
  const os = /(Windows|Android|iPhone|iPad|Mac OS X|Linux)/.exec(ua);
  return [m?.[0]?.replace("Edg", "Edge"), os?.[0]].filter(Boolean).join(" · ") || ua.slice(0, 40);
};

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { user, employee } = session;

  const recentLogins = await db.loginAttempt.findMany({
    where: { login: user.login, success: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

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
          Укажите текущий пароль. После смены вход на других устройствах завершается.
        </p>
        <ChangePasswordForm />
      </Card>

      <Card className="space-y-3 p-5">
        <SectionTitle>Сессии и недавние входы</SectionTitle>
        {recentLogins.length > 0 ? (
          <ul className="divide-y divide-line-subtle text-sm">
            {recentLogins.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-x-4 py-1.5">
                <span className="text-ink">{a.createdAt.toLocaleString("ru-RU")}</span>
                <span className="text-ink-muted">
                  {a.ip} · {shortUa(a.userAgent)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-muted">Записей о входах пока нет.</p>
        )}
        <RevokeSessionsButton />
      </Card>
    </div>
  );
}
