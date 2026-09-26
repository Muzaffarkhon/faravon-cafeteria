import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale } from "@/lib/i18n";
import { NewsForm } from "../_form";
import { NewsPublishActions } from "./_publish-actions";

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const { id } = await params;
  const locale = await getLocale();

  const [news, departments, positions] = await Promise.all([
    db.news.findUnique({ where: { id } }),
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { position: true },
      distinct: ["position"],
      orderBy: { position: "asc" },
    }),
  ]);
  if (!news) notFound();

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{news.title}</h1>
        <NewsPublishActions
          id={news.id}
          status={news.status}
          telegramSentAt={news.telegramSentAt ? news.telegramSentAt.toISOString() : null}
        />
      </div>
      <NewsForm
        initial={{
          id: news.id,
          title: news.title,
          body: news.body,
          imageUrl: news.imageUrl,
          audience: news.audience as { department?: string; position?: string } | null,
          translations: news.translations as Partial<Record<"tg" | "uz", Record<string, string>>> | null,
        }}
        departments={departments.map((d) => d.department)}
        positions={positions.map((p) => p.position)}
        locale={locale}
      />
    </div>
  );
}
