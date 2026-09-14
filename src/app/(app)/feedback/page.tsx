import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { getLocale, getTranslator } from "@/lib/i18n";
import { FeedbackForm } from "./_form";
import { OwnThread } from "./_thread";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "application.select") || !session.employee) redirect("/");

  const locale = await getLocale();
  const t = await getTranslator();

  const threads = await db.supportThread.findMany({
    where: { source: "WEB", employeeId: session.employee.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("feedback.title")}
        description={t("feedback.description")}
      />

      <Card className="p-5">
        <FeedbackForm locale={locale} />
      </Card>

      <section className="space-y-3">
        <SectionTitle>{t("feedback.myThreads")}</SectionTitle>
        {threads.length === 0 ? (
          <EmptyState>{t("feedback.empty")}</EmptyState>
        ) : (
          <div className="space-y-3">
            {threads.map((th) => (
              <OwnThread
                key={th.id}
                threadId={th.id}
                topic={th.topic}
                status={th.status}
                locale={locale}
                messages={th.messages.map((m) => ({
                  id: m.id,
                  direction: m.direction,
                  body: m.body,
                  createdAt: m.createdAt.toISOString(),
                }))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
