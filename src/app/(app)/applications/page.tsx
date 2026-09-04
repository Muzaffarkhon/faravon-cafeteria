import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ITEM_STATUS_LABELS } from "@/lib/application-workflow";
import { Badge, EmptyState, buttonClass, type BadgeTone } from "@/components/ui";
import { isCouponExpired } from "@/lib/coupon";
import { groupProgress } from "@/lib/selection";
import { couponQrSvg } from "@/lib/qr";
import { safeImageSrc } from "@/lib/safe-url";
import { CancelItemButton } from "./_cancel-button";
import { QrZoom } from "./_qr-zoom";

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

  // Прогресс набора групп для льгот с порогом (§ minParticipants), по периодам.
  const groupByPeriod = new Map<string, Map<string, number>>();
  for (const app of applications) {
    const gc = app.items.map((i) => i.card).filter((c) => c.minParticipants > 1).map((c) => c.id);
    if (gc.length) groupByPeriod.set(app.periodId, await groupProgress(gc, app.periodId));
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-[1.5625rem]">
          Мои заявки и купоны
        </h1>
        <p className="text-sm text-ink-muted" data-numeric>
          Периодов: {applications.length} · на согласовании: {pending} · купонов: {coupons}
        </p>
      </header>

      <div className="space-y-6">
        {applications.map((app) => (
          <section key={app.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                {app.period.name}
              </div>
              <span className="text-xs text-ink-muted" data-numeric>
                позиций: {app.items.length}
              </span>
            </div>

            <ul className="space-y-3">
              {app.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 rounded-[18px] bg-surface p-5 shadow-sm"
                >
                  <div className="flex min-w-0 flex-1 gap-4">
                    <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] bg-surface-sunken">
                      {safeImageSrc(item.card.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={safeImageSrc(item.card.imageUrl)!}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-[repeating-linear-gradient(135deg,var(--sand-200)_0_8px,var(--sand-100)_8px_16px)]" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <div className="text-base font-bold leading-snug text-balance text-ink">
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

                    {item.card.minParticipants > 1 &&
                      !["REJECTED", "CANCELLED", "COUPON_ISSUED"].includes(item.status) &&
                      (() => {
                        const have = groupByPeriod.get(app.periodId)?.get(item.cardId) ?? 0;
                        const done = have >= item.card.minParticipants;
                        return (
                          <p
                            className={
                              done
                                ? "rounded-lg bg-success-soft/60 px-3 py-2 text-sm font-medium text-success-strong"
                                : "rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-muted"
                            }
                            data-numeric
                          >
                            Групповая скидка: {Math.min(have, item.card.minParticipants)} /{" "}
                            {item.card.minParticipants}
                            {done ? " — набрана, купон выдадут" : " — ждём набора группы"}
                          </p>
                        );
                      })()}

                    {item.coupon &&
                      (() => {
                        const c = item.coupon;
                        const qr = qrByCoupon.get(c.id);
                        const pastValid = isCouponExpired(c.validUntil);
                        const expired =
                          c.status === "EXPIRED" ||
                          ((c.status === "ISSUED" || c.status === "USED") && pastValid);
                        const live = c.status === "ISSUED" && !expired;
                        // Активированный купон действует до конца срока, затем «истёк».
                        const activatedLive = c.status === "USED" && !pastValid;
                        // Пояснение под номером — почему QR есть / нет и что делать.
                        const hint = expired
                          ? "Срок действия купона истёк."
                          : activatedLive
                            ? "Купон активирован у партнёра и действует до конца срока."
                            : c.status === "CANCELLED"
                              ? "Купон аннулирован."
                              : c.status === "CREATED"
                                ? "Купон сформирован. QR появится после выдачи."
                                : live && qr
                                  ? "Покажите QR партнёру для активации."
                                  : live
                                    ? "QR временно недоступен — назовите партнёру номер купона."
                                    : null;
                        return (
                          <div
                            className={
                              live
                                ? "mt-1 rounded-xl border border-success-soft bg-success-soft/40 p-3"
                                : "mt-1 rounded-xl border border-line bg-surface-muted p-3"
                            }
                          >
                            <div className="flex flex-wrap items-start gap-3">
                              {qr && <QrZoom svg={qr} number={c.number} />}
                              <div
                                className={
                                  live
                                    ? "min-w-0 space-y-0.5 text-sm text-success-strong"
                                    : "min-w-0 space-y-0.5 text-sm text-ink-muted"
                                }
                              >
                                <div className="font-semibold">Купон</div>
                                <div className="font-mono" data-numeric>
                                  № {c.number}
                                </div>
                                {c.validUntil && (live || c.status === "CREATED") && (
                                  <div className={live ? "text-success-strong/80" : ""} data-numeric>
                                    действует до {c.validUntil.toLocaleDateString("ru-RU")}
                                  </div>
                                )}
                                {hint && (
                                  <div className={live ? "pt-1 text-xs text-success-strong/80" : "pt-1 text-xs"}>
                                    {hint}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
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
          </section>
        ))}
      </div>
    </div>
  );
}
