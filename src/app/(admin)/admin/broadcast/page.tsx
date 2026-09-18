import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { BroadcastForm } from "./_form";

export default async function BroadcastPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const [departments, totalRecipients] = await Promise.all([
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
    db.user.count({ where: { isActive: true, employee: { isActive: true, archivedAt: null } } }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{t("broadcast.title")}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t("broadcast.hint")}</p>
      </div>

      <BroadcastForm
        departments={departments.map((d) => d.department)}
        totalRecipients={totalRecipients}
        locale={locale}
      />
    </div>
  );
}
