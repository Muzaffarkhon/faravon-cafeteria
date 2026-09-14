import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
import { QuickRepliesManager } from "./_manager";

export const dynamic = "force-dynamic";

export default async function QuickRepliesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const replies = await db.supportQuickReply.findMany({ orderBy: { createdAt: "asc" } });
  const lastEdits = await lastEditsFor("SupportQuickReply", replies.map((r) => r.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("quickReplies.title")}
        description={t("quickReplies.description")}
      />
      <QuickRepliesManager
        replies={replies.map((r) => ({
          id: r.id,
          text: r.text,
          lastEdit: formatLastEdit(lastEdits.get(r.id), r.updatedAt),
        }))}
        locale={locale}
      />
    </div>
  );
}
