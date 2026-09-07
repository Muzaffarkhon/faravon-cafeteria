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
    ? await db.partner.findUnique({
        where: { id: session.user.partnerId },
        select: { name: true, deliveryMode: true },
      })
    : null;
  // Подрядчик такси (свой поток) — QR-касса не применяется, ведём на «Промокоды».
  if (partner?.deliveryMode === "PHONE_PROMO" && can(session.roles, "promo.broadcast")) {
    redirect("/provider/taxi");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5 text-center">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-[1.5625rem]">
          Проверка льготы у партнёра
        </h1>
        <p className="mx-auto max-w-sm text-sm text-ink-muted">
          {partner
            ? `Без входа в систему — только номер телефона. Вы активируете купоны партнёра «${partner.name}».`
            : "Без входа в систему — только номер телефона клиента."}
        </p>
      </header>

      <ProviderConfirm />
    </div>
  );
}
