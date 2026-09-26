import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale } from "@/lib/i18n";
import { NewsForm } from "../_form";

export default async function NewNewsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const locale = await getLocale();

  const [departments, positions] = await Promise.all([
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { position: true },
      distinct: ["position"],
      orderBy: { position: "asc" },
    }),
  ]);

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink">Новая новость</h1>
      <NewsForm
        departments={departments.map((d) => d.department)}
        positions={positions.map((p) => p.position)}
        locale={locale}
      />
    </div>
  );
}
