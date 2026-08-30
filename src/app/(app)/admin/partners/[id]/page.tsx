import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { updatePartner } from "../actions";
import { PartnerForm } from "../_form";

export default async function EditPartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "partners.manage")) redirect("/");

  const partner = await db.partner.findUnique({ where: { id } });
  if (!partner) notFound();

  const action = updatePartner.bind(null, id);

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Партнёр: {partner.name}</h1>
      <PartnerForm action={action} initial={partner} submitLabel="Сохранить" />
    </div>
  );
}
