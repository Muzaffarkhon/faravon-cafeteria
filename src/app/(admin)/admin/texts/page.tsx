import { redirect } from "next/navigation";
import { MessagesTabs } from "@/components/messages-tabs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
import { TextBlockForm } from "./_form";

export default async function TextsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const HINTS: Record<string, string> = {
    GOAL: t("texts.hintGoal"),
    NOVELTY_NOTICE: t("texts.hintNoveltyNotice"),
  };

  const blocks = await db.textBlock.findMany({ orderBy: { key: "asc" } });
  const lastEdits = await lastEditsFor("TextBlock", blocks.map((b) => b.key));

  return (
    <div className="space-y-5">
      <MessagesTabs active="texts" />
      <h1 className="font-display text-2xl font-bold text-ink">{t("texts.title")}</h1>
      <div className="space-y-4">
        {blocks.map((b) => (
          <div key={b.key}>
            {HINTS[b.key] && (
              <p className="mb-1 text-xs text-ink-subtle">{HINTS[b.key]}</p>
            )}
            <p className="mb-1 text-xs text-ink-subtle" data-numeric>
              {t("texts.editedLabel")}: {formatLastEdit(lastEdits.get(b.key), b.updatedAt)}
            </p>
            <TextBlockForm
              blockKey={b.key}
              title={b.title}
              content={b.content}
              translations={b.translations as Record<"tg" | "uz", Record<string, string>> | null}
              locale={locale}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
