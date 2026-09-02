import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ProviderConfirm } from "./_confirm";

export default async function ProviderPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "coupons.confirm")) redirect("/");

  const partner = session.user.partnerId
    ? await db.partner.findUnique({ where: { id: session.user.partnerId }, select: { name: true } })
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          Партнёр
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          Активация купонов
        </h1>
        <p className="text-sm text-ink-muted">
          {partner
            ? `Вы активируете купоны партнёра «${partner.name}». Купоны других партнёров недоступны.`
            : "Введите номер купона сотрудника, проверьте данные и активируйте."}
        </p>
      </header>

      <ProviderConfirm />
    </div>
  );
}
