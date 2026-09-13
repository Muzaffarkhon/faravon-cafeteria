import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { itemStatusLabel } from "@/lib/application-workflow";
import { Badge, EmptyState, buttonClass, type BadgeTone } from "@/components/ui";
import { isCouponExpired, isCouponOverdue, isCouponPeriodPassed } from "@/lib/coupon";
import { groupProgress } from "@/lib/selection";
import { couponQrSvg } from "@/lib/qr";
import { safeImageSrc } from "@/lib/safe-url";
import { getLocale, getTranslator } from "@/lib/i18n";
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

  const locale = await getLocale();
  const t = await getTranslator();

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
            {t("applications.emptyAction")}
          </Link>
        }
      >
        {t("applications.emptyText")}
      </EmptyState>
    );
  }

  const blockedPromo = await db.notification.findFirst({
    where: { userId: session.user.id, event: "TAXI_PROMO_CODE", blockedAt: { not: null } },
    orderBy: { sentAt: "desc" },
  });

  const allItems = applications.flatMap((a) => a.items);
  const coupons = allItems.filter((i) => i.coupon).length;
  const pending = allItems.filter((i) => i.status === "PENDING").length;

  // QR только для действующих (выданных, не просроченных) купонов.
  const issuedCoupons = applications.flatMap((app) =>
    app.items
      .map((i) => i.coupon)
      .filter(
        (c): c is NonNullable<typeof c> =>
          !!c && c.status === "ISSUED" && !isCouponOverdue({ ...c, period: app.period }),
      ),
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
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          {t("applications.title")}
        </h1>
        <p className="text-sm text-ink-muted" data-numeric>
          {t("applications.summary")}: {applications.length} · {t("applications.pendingShort")}: {pending} · {t("applications.couponsShort")}: {coupons}
        </p>
      </header>

      {blockedPromo && (
        <p className="rounded-xl border border-warning-soft bg-warning-soft/40 px-4 py-3 text-sm text-warning-strong">
          {t("applications.blockedPromo")}
        </p>
      )}

      <div className="space-y-6">
        {applications.map((app) => (
          <section key={app.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                {app.period.name}
              </div>
              <span className="text-xs text-ink-muted" data-numeric>
                {t("applications.itemsCount")}: {app.items.length}
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
                        {item.card.partner?.name ?? t("applications.noPartner")}
                        {item.submittedAt && (
                          <span data-numeric>
                            {` · ${t("applications.submittedOn")} `}
                            {item.submittedAt.toLocaleDateString("ru-RU")}
                          </span>
                        )}
                      </div>

                    {item.status === "REJECTED" && item.decisionComment && (
                      <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                        {t("applications.rejectReason")}: {item.decisionComment}
                      </p>
                    )}

                    {(() => {
                      const isGroup = item.card.minParticipants > 1;
                      const groupHave = isGroup
                        ? groupByPeriod.get(app.periodId)?.get(item.cardId) ?? 0
                        : 0;
                      const groupDone = !isGroup || groupHave >= item.card.minParticipants;

                      return (
                        <>
                          {isGroup &&
                            !["REJECTED", "CANCELLED", "COUPON_ISSUED"].includes(item.status) && (
                              <p
                                className={
                                  groupDone
                                    ? "rounded-lg bg-success-soft/60 px-3 py-2 text-sm font-medium text-success-strong"
                                    : "rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-muted"
                                }
                                data-numeric
                              >
                                {t("applications.groupDiscount")}: {Math.min(groupHave, item.card.minParticipants)} /{" "}
                                {item.card.minParticipants}
                                {groupDone ? ` — ${t("applications.groupDone")}` : ` — ${t("applications.groupWaiting")}`}
                              </p>
                            )}

                          {item.coupon &&
                            (() => {
                              const c = item.coupon!;
                        const qr = qrByCoupon.get(c.id);
                        const pastValid = isCouponExpired(c.validUntil);
                        const periodPassed = isCouponPeriodPassed(app.period);
                        const overdue = isCouponOverdue({ ...c, period: app.period });
                        const expired = overdue;
                        const live = c.status === "ISSUED" && !expired;
                        // Активированный купон действует до конца срока, затем «истёк».
                        const activatedLive = c.status === "USED" && !pastValid && !periodPassed;
                        // Пояснение под номером — почему QR есть / нет и что делать.
                        const hint = expired
                          ? periodPassed
                            ? t("applications.hintExpiredPeriod")
                            : t("applications.hintExpired")
                          : activatedLive
                            ? t("applications.hintActivatedLive")
                            : c.status === "CANCELLED"
                              ? t("applications.hintCancelled")
                              : c.status === "CREATED"
                                ? t("applications.hintCreated")
                                : live && qr
                                  ? t("applications.hintShowQr")
                                  : live
                                    ? t("applications.hintNoQr")
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
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{t("applications.coupon")}</span>
                                  {expired && (
                                    <Badge tone="warning" className="px-1.5 py-0 text-[11px]">
                                      {t("applications.overdue")}
                                    </Badge>
                                  )}
                                </div>
                                <div className="font-mono" data-numeric>
                                  {t("applications.couponNumberShort")} {c.number}
                                </div>
                                {groupDone && c.validUntil && (live || c.status === "CREATED") && (
                                  <div className={live ? "text-success-strong/80" : ""} data-numeric>
                                    {t("applications.periodShort")}: {app.period.startDate.toLocaleDateString("ru-RU")} –{" "}
                                    {c.validUntil.toLocaleDateString("ru-RU")}
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
                        </>
                      );
                    })()}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {item.coupon && isCouponOverdue({ ...item.coupon, period: app.period }) ? (
                      <Badge tone="warning">{t("applications.overdue")}</Badge>
                    ) : (
                      <Badge tone={STATUS_TONE[item.status] ?? "neutral"}>
                        {itemStatusLabel(locale, item.status)}
                      </Badge>
                    )}
                    {(item.status === "DRAFT" || item.status === "PENDING") && (
                      <CancelItemButton itemId={item.id} locale={locale} />
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
