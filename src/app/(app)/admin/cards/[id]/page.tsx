import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { updateCard } from "../actions";
import { CardForm } from "../_form";

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");

  const [card, partners] = await Promise.all([
    db.benefitCard.findUnique({ where: { id } }),
    db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!card) notFound();

  const action = updateCard.bind(null, id);

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Карточка: {card.title}</h1>
      <CardForm action={action} partners={partners} initial={card} submitLabel="Сохранить" />
    </div>
  );
}
