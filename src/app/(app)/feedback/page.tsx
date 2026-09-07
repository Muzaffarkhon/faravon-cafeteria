import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, type BadgeTone } from "@/components/ui";
import { FEEDBACK_STATUS_LABEL, FEEDBACK_STATUS_TONE } from "@/lib/feedback";
import { FeedbackForm } from "./_form";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "application.select") || !session.employee) redirect("/");

  const mine = await db.feedback.findMany({
    where: { employeeId: session.employee.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Обратная связь"
        description="Вопрос, проблема или предложение по программе льгот. Обращение видит C&B."
      />

      <Card className="p-5">
        <FeedbackForm />
      </Card>

      <section className="space-y-3">
        <SectionTitle>Мои обращения</SectionTitle>
        {mine.length === 0 ? (
          <EmptyState>Вы ещё не отправляли обращений.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {mine.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink">{f.topic || "Без темы"}</div>
                  <Badge tone={FEEDBACK_STATUS_TONE[f.status] as BadgeTone}>
                    {FEEDBACK_STATUS_LABEL[f.status]}
                  </Badge>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-ink-muted">
                  {f.message}
                </p>
                <div className="mt-2 text-xs text-ink-subtle" data-numeric>
                  {f.createdAt.toLocaleDateString("ru-RU")}
                </div>
                {f.adminNote && (
                  <p className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
                    <span className="font-semibold">Ответ C&amp;B: </span>
                    {f.adminNote}
                  </p>
                )}
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
