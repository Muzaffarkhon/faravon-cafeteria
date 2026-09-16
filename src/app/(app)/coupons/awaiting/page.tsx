import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { EmptyState, SectionTitle, buttonClass } from "@/components/ui";
import { CreateCouponButton, RejectAwaitingButton } from "../_buttons";

export const dynamic = "force-dynamic";

const AWAITING_CAP = 200;

export default async function CouponsAwaitingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "coupons.manage")) redirect("/");

  const locale = await getLocale();
  const t = await getTranslator();

  const now = new Date();
  // Купон не нужен: завершённый период (закрыт / срок вышел) ИЛИ партнёр,
  // работающий по номеру телефона (промокод рассылает подрядчик).
  const awaitingWhere = {
    status: "APPROVED" as const,
    coupon: null,
    application: { is: { period: { is: { status: { not: "CLOSED" as const }, endDate: { gte: now } } } } },
    NOT: { card: { is: { partner: { is: { deliveryMode: "PHONE_PROMO" as const } } } } },
  };

  const [awaiting, awaitingTotal] = await Promise.all([
    db.applicationItem.findMany({
      where: awaitingWhere,
      include: {
        card: { include: { partner: true } },
        application: { include: { employee: true, period: true } },
      },
      orderBy: { decidedAt: "asc" },
      take: AWAITING_CAP,
    }),
    db.applicationItem.count({ where: awaitingWhere }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{t("coupons.awaitingTitle")}</h1>
        <Link href="/coupons" className={buttonClass({ variant: "secondary", size: "sm" })}>
          {t("coupons.registryTitle")} →
        </Link>
      </div>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={awaitingTotal}>
          {t("coupons.awaitingTitle")}
        </SectionTitle>
        {awaitingTotal > awaiting.length && (
          <p className="text-sm text-ink-muted">
            {t("coupons.awaitingShown")} {awaiting.length}. {t("coupons.awaitingHint")}
          </p>
        )}
        {awaiting.length === 0 ? (
          <EmptyState>{t("coupons.awaitingEmpty")}</EmptyState>
        ) : (
          <ul className="space-y-3">
            {awaiting.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-surface p-5 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="text-[0.9375rem] font-bold text-ink">{item.card.title}</div>
                  <div className="mt-0.5 text-sm text-ink-subtle">
                    {item.application.employee.fullName} · {item.card.partner?.name ?? "—"} ·{" "}
                    {item.application.period.name}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <CreateCouponButton itemId={item.id} locale={locale} />
                  <RejectAwaitingButton itemId={item.id} cardTitle={item.card.title} locale={locale} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
