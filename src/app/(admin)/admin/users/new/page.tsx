import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { getLocale, getTranslator } from "@/lib/i18n";
import { NewAccount } from "../_new-account";

export default async function NewUserPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "users.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const partners = await db.partner.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("users.newPage.title")}
        description={t("users.newPage.description")}
      />
      <NewAccount partners={partners} locale={locale} />
    </div>
  );
}
