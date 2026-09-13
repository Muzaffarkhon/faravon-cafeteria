import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { NewAccount } from "../_new-account";

export default async function NewUserPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "users.manage")) redirect("/");

  const partners = await db.partner.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Новая учётная запись"
        description="Выберите тип — сотрудник или служебная роль — и заполните форму."
      />
      <NewAccount partners={partners} />
    </div>
  );
}
