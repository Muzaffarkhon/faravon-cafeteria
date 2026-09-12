import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { FaqManager } from "./_manager";

export const dynamic = "force-dynamic";

export default async function SupportFaqPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage")) redirect("/");

  const faqs = await db.supportFaq.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Частые вопросы"
        description="Кнопки с вопросами под сообщениями бота в чате поддержки — гость тапает, бот отвечает шаблоном автоматически, вопрос и ответ видны в переписке."
      />
      <FaqManager faqs={faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer }))} />
    </div>
  );
}
