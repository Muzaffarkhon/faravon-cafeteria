import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ITEM_STATUS_LABELS } from "@/lib/application-workflow";
import { Badge, Card, EmptyState, buttonClass, type BadgeTone } from "@/components/ui";
import { isCouponExpired } from "@/lib/coupon";
import { couponQrSvg } from "@/lib/qr";
import { CancelItemButton } from "./_cancel-button";

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  COUPON_CREATED: "accent",
  COUPON_ISSUED: "success",
  REJECTED: "brand",
  CANCELLED: "muted",
};

export default async function ApplicationsPage() {
  const session = await getSession();
  if (!session?.employee) redirect("/");

  const applications = await db.application.findMany({
    where: { employeeId: session.employee.id },
    include: {
      period: true,
      items: {
        include: { card: { include: { partner: true } }, coupon: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (applications.length === 0) {
    return (
      <EmptyState
        action={
          <Link href="/" className={buttonClass({ variant: "primary", size: "sm" })}>
            Перейти к выбору льгот
          </Link>
        }
      >
        В этом периоде вы ещё не выбрали льготы. Откройте обзор и отметьте нужные карточки.
      </EmptyState>
    );
  }

  const allItems = applications.flatMap((a) => a.items);
  const coupons = allItems.filter((i) => i.coupon).length;
  const pending = allItems.filter((i) => i.status === "PENDING").length;

  // QR только для действующих (выданных, не просроченных) купонов.
  const issuedCoupons = allItems
    .map((i) => i.coupon)
    .filter(
      (c): c is NonNullable<typeof c> =>
        !!c && c.status === "ISSUED" && !isCouponExpired(c.validUntil),
    );
  const qrByCoupon = new Map(
    await Promise.all(
      issuedCoupons.map(
        async (c) =>
          [c.id, await couponQrSvg(c.number).catch(() => null)] as const,
      ),
    ),
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          Личный кабинет
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          Мои заявки и купоны
        </h1>
        <p className="text-sm text-ink-muted" data-numeric>
          Периодов: {applications.length} · на согласовании: {pending} · купонов: {coupons}
        </p>
      </header>

      <div className="space-y-5">
        {applications.map((app) => (
          <Card key={app.id} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line-subtle bg-surface-muted/60 px-5 py-3.5">
              <div className="text-[0.9375rem] font-semibold text-ink">{app.period.name}</div>
              <span className="text-xs text-ink-muted" data-numeric>
                позиций: {app.items.length}
              </span>
            </div>

            <ul className="divide-y divide-line-subtle">
              {app.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 py-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="text-base font-semibold leading-snug text-balance text-ink">
                      {item.card.title}
                    </div>
                    <div className="text-sm text-ink-muted">
                      {item.card.partner?.name ?? "Без партнёра"}
                      {item.submittedAt && (
                        <span data-numeric>
                          {" · подано "}
                          {item.submittedAt.toLocaleDateString("ru-RU")}
                        </span>
                      )}
                    </div>

                    {item.status === "REJECTED" && item.decisionComment && (
                      <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                        Причина отклонения: {item.decisionComment}
                      </p>
                    )}

                    {item.coupon &&
                      (() => {
                        const qr = qrByCoupon.get(item.coupon.id);
                        const expired =
                          item.coupon.status === "ISSUED" &&
                          isCouponExpired(item.coupon.validUntil);
                        return (
                          <div
                            className={
                              expired
                                ? "mt-1 rounded-xl border border-line bg-surface-muted p-3"
                                : "mt-1 rounded-xl border border-success-soft bg-success-soft/40 p-3"
                            }
                          >
                            <div className="flex flex-wrap items-start gap-3">
                              {qr && (
                                <div
                                  className="shrink-0 rounded-lg bg-white p-2 shadow-xs [&>svg]:block [&>svg]:h-[108px] [&>svg]:w-[108px]"
                                  dangerouslySetInnerHTML={{ __html: qr }}
                                />
                              )}
                              <div
                                className={
                                  expired
                                    ? "min-w-0 space-y-0.5 text-sm text-ink-muted"
                                    : "min-w-0 space-y-0.5 text-sm text-success-strong"
                                }
                              >
                                <div className="font-semibold">Купон</div>
                                <div className="font-mono" data-numeric>
                                  № {item.coupon.number}
                                </div>
                                {item.coupon.validUntil && (
                                  <div className={expired ? "font-medium text-danger" : "text-success-strong/80"} data-numeric>
                                    {expired ? "срок истёк " : "действует до "}
                                    {item.coupon.validUntil.toLocaleDateString("ru-RU")}
                                  </div>
                                )}
                                {qr && (
                                  <div className="pt-1 text-xs text-success-strong/80">
                                    Покажите QR подрядчику для гашения.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={STATUS_TONE[item.status] ?? "neutral"}>
                      {ITEM_STATUS_LABELS[item.status]}
                    </Badge>
                    {(item.status === "DRAFT" || item.status === "PENDING") && (
                      <CancelItemButton itemId={item.id} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
