import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { EMPLOYMENT_STATUS_LABELS } from "@/lib/labels";
import { Badge, Card, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { updateEmployee } from "../actions";
import { EmployeeForm } from "../_form";
import { AccountPanel, EmployeeActiveToggle } from "../_account";

export const dynamic = "force-dynamic";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "users.manage")) redirect("/");

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
            {!employee.isActive && (
              <Badge tone="muted">{EMPLOYMENT_STATUS_LABELS[employee.status]}</Badge>
            )}
            <Link href="/admin/users" className={buttonClass({ variant: "secondary", size: "sm" })}>
              К списку
            </Link>
          </div>
        }
      />

      <section className="space-y-3">
        <SectionTitle>Данные сотрудника</SectionTitle>
        <Card className="p-5">
          <EmployeeForm
            action={updateEmployee.bind(null, id)}
            initial={{
              tabNumber: employee.tabNumber,
              fullName: employee.fullName,
              position: employee.position,
              department: employee.department,
              phone: employee.phone,
              telegramId: employee.telegramId,
            }}
            submitLabel="Сохранить"
          />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>Учётная запись и роли</SectionTitle>
        <Card className="p-5">
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
          />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>Приём / увольнение</SectionTitle>
        <Card className="space-y-3 p-5">
          <p className="text-sm text-ink-muted">
            {employee.isActive
              ? "Сотрудник активен. Деактивация закрывает вход в его учётную запись; история сохраняется."
              : `Сотрудник деактивирован${
                  employee.terminatedAt
                    ? ` ${employee.terminatedAt.toLocaleDateString("ru-RU")}`
                    : ""
                }.`}
          </p>
          <EmployeeActiveToggle employeeId={id} isActive={employee.isActive} />
        </Card>
      </section>
    </div>
  );
}
