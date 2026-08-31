import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createCard } from "../actions";
import { CardForm } from "../_form";

export default async function NewCardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");

  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-ink">Новая карточка</h1>
      <CardForm action={createCard} partners={partners} submitLabel="Создать" />
    </div>
  );
}
