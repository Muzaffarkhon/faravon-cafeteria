import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { employmentStatusLabel } from "@/lib/labels";
import { Badge, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { getLocale, getTranslator } from "@/lib/i18n";
import { updateEmployee } from "../actions";
import { EmployeeForm } from "../_form";
import { AccountPanel, EmployeeActiveToggle } from "../_account";
import { EmployeeArchiveButton } from "../_archive-button";

export const dynamic = "force-dynamic";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "users.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const { id } = await params;
  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          login: true,
          roles: true,
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: true,
        },
      },
    },
  });
  if (!employee) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        title={employee.fullName}
        description={`${employee.position} · ${employee.department}`}
        action={
          <div className="flex items-center gap-3">
            {employee.archivedAt ? (
              <Badge tone="muted">{t("users.edit.inArchive")}</Badge>
            ) : (
              !employee.isActive && (
                <Badge tone="muted">{employmentStatusLabel(locale, employee.status)}</Badge>
              )
            )}
            <Link href="/admin/users" className={buttonClass({ variant: "secondary", size: "sm" })}>
              {t("users.edit.toList")}
            </Link>
          </div>
        }
      />

      <section className="rounded-2xl border border-line bg-surface">
        <div className="p-5">
          <SectionTitle>{t("users.edit.employeeData")}</SectionTitle>
        </div>
        <div className="border-t border-line-subtle p-5">
          <EmployeeForm
            action={updateEmployee.bind(null, id)}
            initial={{
              fullName: employee.fullName,
              position: employee.position,
              department: employee.department,
              phone: employee.phone,
              phoneSecondary: employee.phoneSecondary,
              telegramId: employee.telegramId,
            }}
            submitLabel={t("users.edit.save")}
            locale={locale}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface">
        <div className="p-5">
          <SectionTitle>{t("users.edit.accountAndRoles")}</SectionTitle>
        </div>
        <div className="border-t border-line-subtle p-5">
          <AccountPanel
            employeeId={id}
            user={
              employee.user
                ? {
                    ...employee.user,
                    lastLoginAt: employee.user.lastLoginAt
                      ? employee.user.lastLoginAt.toISOString()
                      : null,
                  }
                : null
            }
            locale={locale}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface">
        <div className="p-5">
          <SectionTitle>{t("users.edit.onboarding")}</SectionTitle>
        </div>
        <div className="space-y-3 border-t border-line-subtle p-5">
          <p className="text-sm text-ink-muted">
            {employee.isActive
              ? t("users.edit.activeHint")
              : `${t("users.edit.deactivatedPrefix")}${
                  employee.terminatedAt
                    ? ` ${employee.terminatedAt.toLocaleDateString("ru-RU")}`
                    : ""
                }.`}
          </p>
          <EmployeeActiveToggle employeeId={id} isActive={employee.isActive} locale={locale} />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface">
        <div className="p-5">
          <SectionTitle>{t("users.edit.archive")}</SectionTitle>
        </div>
        <div className="space-y-3 border-t border-line-subtle p-5">
          <p className="text-sm text-ink-muted">
            {employee.archivedAt
              ? `${t("users.edit.archivedSincePrefix")} ${employee.archivedAt.toLocaleDateString("ru-RU")}. ${t("users.edit.archivedHint")}`
              : t("users.edit.archiveHint")}
          </p>
          <EmployeeArchiveButton id={id} archived={!!employee.archivedAt} size="md" locale={locale} />
        </div>
      </section>
    </div>
  );
}
