import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { SectionTitle } from "@/components/ui";
import { getLocale, getTranslator } from "@/lib/i18n";
import { updateCard } from "../actions";
import { CardForm, type CardValues } from "../_form";
import { CardHistory, type CardVersionRow } from "../_history";

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const [card, partners, allPartners, categoryRows, versions] = await Promise.all([
    db.benefitCard.findUnique({ where: { id } }),
    db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.partner.findMany({ select: { id: true, name: true } }),
    db.benefitCard.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ["category"],
    }),
    db.benefitCardVersion.findMany({
      where: { cardId: id },
      orderBy: { version: "desc" },
      include: {
        editedBy: { select: { login: true, employee: { select: { fullName: true } } } },
      },
    }),
  ]);
  if (!card) notFound();

  const categories = categoryRows.map((c) => c.category!).sort();
  const action = updateCard.bind(null, id);
  const partnerNames = Object.fromEntries(allPartners.map((p) => [p.id, p.name]));
  const historyRows: CardVersionRow[] = versions.map((v) => ({
    id: v.id,
    version: v.version,
    reason: v.reason,
    createdAt: v.createdAt.toLocaleString("ru-RU"),
    editor: v.editedBy?.employee?.fullName ?? v.editedBy?.login ?? null,
    block: v.block,
    title: v.title,
    description: v.description,
    condition: v.condition,
    imageUrl: v.imageUrl,
    category: v.category,
    isActive: v.isActive,
    status: v.status,
    sortOrder: v.sortOrder,
    minParticipants: v.minParticipants,
    partnerId: v.partnerId,
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-bold text-ink">{t("cards.editTitlePrefix")} {card.title}</h1>
        <CardForm
          action={action}
          partners={partners}
          categories={categories}
          initial={{ ...card, translations: card.translations as CardValues["translations"] }}
          submitLabel={t("cards.save")}
          locale={locale}
        />
      </div>

      <section className="space-y-3">
        <SectionTitle>{t("cards.history")}</SectionTitle>
        <CardHistory versions={historyRows} partnerNames={partnerNames} />
      </section>
    </div>
  );
}
