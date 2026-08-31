import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { updatePeriod } from "../actions";
import { PeriodForm } from "../_form";

export default async function EditPeriodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "periods.manage")) redirect("/");

  const period = await db.period.findUnique({ where: { id } });
  if (!period) notFound();
  if (period.status === "CLOSED") redirect("/admin/periods");

  const action = updatePeriod.bind(null, id);

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-ink">Период: {period.name}</h1>
      <PeriodForm action={action} initial={period} submitLabel="Сохранить" />
    </div>
  );
}
