import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { EmptyState, PageHeader } from "@/components/ui";
import { FeedbackTable } from "./_table";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "feedback.manage")) redirect("/");

  const rows = await db.feedback.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { employee: { select: { fullName: true, department: true } } },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Обратная связь"
        description="Обращения сотрудников: прочитано → принято к сведению → закрыто."
      />
      {rows.length === 0 ? (
        <EmptyState>Обращений пока нет.</EmptyState>
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
