import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { QuickRepliesManager } from "./_manager";

export const dynamic = "force-dynamic";

export default async function QuickRepliesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage")) redirect("/");

  const replies = await db.supportQuickReply.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Быстрые ответы"
        description="Заготовленные ответы для чата поддержки — по клику подставляются в поле ответа."
      />
      <QuickRepliesManager replies={replies.map((r) => ({ id: r.id, text: r.text }))} />
    </div>
  );
}
