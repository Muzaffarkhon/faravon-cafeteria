import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { createPartner } from "../actions";
import { PartnerForm } from "../_form";

export default async function NewPartnerPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "partners.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink">{t("partners.newTitle")}</h1>
      <PartnerForm action={createPartner} submitLabel={t("partners.create")} locale={locale} />
    </div>
  );
}
