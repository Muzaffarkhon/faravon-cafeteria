import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";
import { Card, SectionTitle } from "@/components/ui";
import { ChangePasswordForm } from "./_form";
import { ContactEditor, TelegramLink } from "./_contacts";
import { RevokeSessionsButton } from "./_sessions";
import { ThemeToggle } from "./_theme-toggle";

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
  if (user.lastLoginAt) {
    rows.push({ k: "Последний вход", v: <span data-numeric>{user.lastLoginAt.toLocaleString("ru-RU")}</span> });
  }

  return (
    <div className="space-y-6">
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
        <SectionTitle className="text-lg">Оформление</SectionTitle>
        <p className="mt-1 max-w-prose text-sm leading-6 text-ink-muted">
          Тема интерфейса. «Системная» следует настройке устройства.
        </p>
        <ThemeToggle />
      </Card>

      {employee && (
        <Card className="p-6">
          <SectionTitle className="text-lg">Контакты и Telegram</SectionTitle>
          <p className="mt-1 max-w-prose text-sm leading-6 text-ink-muted">
            Телефон и привязка к Telegram-боту нужны для входа и уведомлений.
          </p>
          <ContactEditor phone={employee.phone} />
          <div className="mt-5 border-t border-line-subtle pt-4">
            <TelegramLink linked={!!employee.telegramId} />
          </div>
        </Card>
      )}

      <Card className="p-6">
        <SectionTitle className="text-lg">Смена пароля</SectionTitle>
        <p className="mt-1 max-w-prose text-sm leading-6 text-ink-muted">
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
