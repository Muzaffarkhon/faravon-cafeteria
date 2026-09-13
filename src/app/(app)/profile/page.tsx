import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";
import { SectionTitle } from "@/components/ui";
import { ChangePasswordForm } from "./_form";
import { ContactEditor, TelegramLink, ServiceTelegramLink } from "./_contacts";
import { RevokeSessionsButton } from "./_sessions";
import { ThemeToggle } from "@/components/theme-toggle";
import { getLocale, getTranslator } from "@/lib/i18n";

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
  const locale = await getLocale();
  const t = await getTranslator();

  const recentLogins = await db.loginAttempt.findMany({
    where: { login: user.login, success: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const rows: { k: string; v: ReactNode }[] = [];
  if (employee) {
    rows.push(
      { k: t("profile.fullName"), v: employee.fullName },
      { k: t("profile.position"), v: employee.position },
      { k: t("profile.department"), v: employee.department },
    );
  }
  rows.push(
    { k: t("profile.login"), v: <span className="font-mono">{user.login}</span> },
    { k: t("profile.roles"), v: session.roles.map((r) => ROLE_LABELS[r]).join(", ") },
  );
  if (user.lastLoginAt) {
    rows.push({ k: t("profile.lastLogin"), v: <span data-numeric>{user.lastLoginAt.toLocaleString("ru-RU")}</span> });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-[1.5625rem]">{t("profile.title")}</h1>
      </header>

      <div className="rounded-[18px] bg-surface p-6 shadow-sm">
        <dl className="grid gap-x-8 gap-y-3.5 text-[0.9375rem] sm:grid-cols-[170px_1fr]">
          {rows.map((r) => (
            <div key={r.k} className="contents">
              <dt className="text-ink-muted">{r.k}</dt>
              <dd className="font-medium text-ink">{r.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-[18px] bg-surface p-6 shadow-sm">
        <SectionTitle className="text-lg">{t("profile.appearance")}</SectionTitle>
        <p className="mt-1 max-w-prose text-sm leading-6 text-ink-muted">
          {t("profile.appearanceHint")}
        </p>
        <ThemeToggle />
      </div>

      <div className="rounded-[18px] bg-surface p-6 shadow-sm">
        <SectionTitle className="text-lg">{t("profile.contactsTitle")}</SectionTitle>
        <p className="mt-1 max-w-prose text-sm leading-6 text-ink-muted">
          {t("profile.contactsHint")}
        </p>
        {employee ? (
          <>
            <ContactEditor phone={employee.phone} locale={locale} />
            <div className="mt-5 border-t border-line-subtle pt-4">
              <TelegramLink linked={!!employee.telegramId} locale={locale} />
            </div>
          </>
        ) : (
          <ServiceTelegramLink linked={!!user.telegramId} locale={locale} />
        )}
      </div>

      <div className="rounded-[18px] bg-surface p-6 shadow-sm">
        <SectionTitle className="text-lg">{t("profile.passwordTitle")}</SectionTitle>
        <p className="mt-1 max-w-prose text-sm leading-6 text-ink-muted">
          {t("profile.passwordHint")}
        </p>
        <ChangePasswordForm locale={locale} />
      </div>

      <div className="space-y-3 rounded-[18px] bg-surface p-5 shadow-sm">
        <SectionTitle>{t("profile.sessionsTitle")}</SectionTitle>
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
          <p className="text-xs text-ink-muted">{t("profile.noLogins")}</p>
        )}
        <RevokeSessionsButton locale={locale} />
      </div>
    </div>
  );
}
