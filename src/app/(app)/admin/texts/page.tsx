import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { TextBlockForm } from "./_form";

const HINTS: Record<string, string> = {
  GOAL: "Блок «Цель программы» в личном кабинете сотрудника (§5.3).",
  NOVELTY_NOTICE: "Уведомление о новизне проекта в блоке «Реестр гибких льгот» (§5.6).",
};

export default async function TextsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");

  const blocks = await db.textBlock.findMany({ orderBy: { key: "asc" } });

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-ink">Текстовые блоки</h1>
      <div className="space-y-4">
        {blocks.map((b) => (
          <div key={b.key}>
            {HINTS[b.key] && (
              <p className="mb-1 text-xs text-ink-subtle">{HINTS[b.key]}</p>
            )}
            <TextBlockForm blockKey={b.key} title={b.title} content={b.content} />
          </div>
        ))}
      </div>
    </div>
  );
}
