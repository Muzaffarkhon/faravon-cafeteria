import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { EmptyState } from "@/components/ui";
import { FeedbackTable } from "./_table";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "feedback.manage")) redirect("/");

  // ?emp=<id> — переход из реестра пользователей («перейти к обращениям»).
  const emp = (await searchParams).emp;
  const employee = emp
    ? await db.employee.findUnique({ where: { id: emp }, select: { fullName: true } })
    : null;

  const rows = await db.feedback.findMany({
    where: emp ? { employeeId: emp } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { employee: { select: { fullName: true, department: true } } },
    take: 200,
  });

  return (
    <div className="space-y-6">
      {emp && (
        <p className="text-sm text-ink-muted">
          Показаны обращения одного сотрудника{employee ? `: ${employee.fullName}` : ""}.{" "}
          <Link href="/admin/feedback" className="text-primary hover:underline">
            показать все
          </Link>
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState>{emp ? "У сотрудника нет обращений." : "Обращений пока нет."}</EmptyState>
      ) : (
        <FeedbackTable
          rows={rows.map((f) => ({
            id: f.id,
            employee: f.employee.fullName,
            department: f.employee.department,
            topic: f.topic,
            message: f.message,
            status: f.status,
            adminNote: f.adminNote,
            createdAt: f.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
