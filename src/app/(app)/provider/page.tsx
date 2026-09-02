import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ProviderConfirm } from "./_confirm";

export default async function ProviderPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "coupons.confirm")) redirect("/");

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          Партнёр
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          Погашение купонов
        </h1>
        <p className="text-sm text-ink-muted">
          Введите номер купона сотрудника, проверьте данные и подтвердите использование.
        </p>
      </header>

      <ProviderConfirm />
    </div>
  );
}
