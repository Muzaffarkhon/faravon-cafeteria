import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { createCard } from "../actions";
import { CardForm } from "../_form";

export default async function NewCardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const [partners, categoryRows] = await Promise.all([
    db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.benefitCard.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);
  const categories = categoryRows.map((c) => c.category!).sort();

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink">{t("cards.newTitle")}</h1>
      <CardForm action={createCard} partners={partners} categories={categories} submitLabel={t("cards.create")} locale={locale} />
    </div>
  );
}
