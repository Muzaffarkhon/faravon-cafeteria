import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
import { FaqManager } from "./_manager";

export const dynamic = "force-dynamic";

export default async function SupportFaqPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const faqs = await db.supportFaq.findMany({ orderBy: { createdAt: "asc" } });
  const lastEdits = await lastEditsFor("SupportFaq", faqs.map((f) => f.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("faq.title")}
        description={t("faq.description")}
      />
      <FaqManager
        faqs={faqs.map((f) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          lastEdit: formatLastEdit(lastEdits.get(f.id), f.updatedAt),
        }))}
        locale={locale}
      />
    </div>
  );
}
