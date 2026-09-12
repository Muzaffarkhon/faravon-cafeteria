import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { updatePartner } from "../actions";
import { PartnerForm } from "../_form";
import { PartnerContractorAccounts } from "./_contractor-accounts";

export default async function EditPartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "partners.manage")) redirect("/");

  const [partner, accounts] = await Promise.all([
    db.partner.findUnique({ where: { id } }),
    db.user.findMany({
      where: { partnerId: id, roles: { has: "CONTRACTOR" } },
      select: { id: true, login: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!partner) notFound();

  const action = updatePartner.bind(null, id);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Партнёр: {partner.name}</h1>
      <PartnerContractorAccounts
        partnerId={partner.id}
        partnerName={partner.name}
        accounts={accounts}
      />
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-ink">Параметры и договор партнёра</h2>
        <PartnerForm action={action} initial={partner} submitLabel="Сохранить" />
      </div>
    </div>
  );
}

