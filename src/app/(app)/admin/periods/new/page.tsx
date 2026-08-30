import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createPeriod } from "../actions";
import { PeriodForm } from "../_form";

export default async function NewPeriodPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "periods.manage")) redirect("/");

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Новый период</h1>
      <p className="text-sm text-neutral-500">
        Период создаётся в статусе «Черновик». Откройте его на странице списка, когда всё готово.
      </p>
      <PeriodForm action={createPeriod} submitLabel="Создать" />
    </div>
  );
}
