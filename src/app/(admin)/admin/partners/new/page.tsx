import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createPartner } from "../actions";
import { PartnerForm } from "../_form";

export default async function NewPartnerPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "partners.manage")) redirect("/");

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink">Новый партнёр</h1>
      <PartnerForm action={createPartner} submitLabel="Создать" />
    </div>
  );
}
