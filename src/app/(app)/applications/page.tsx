import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { itemStatusLabel } from "@/lib/application-workflow";
import { Badge, EmptyState, buttonClass, type BadgeTone } from "@/components/ui";
import { isCouponExpired, isCouponOverdue, isCouponPeriodPassed } from "@/lib/coupon";
import { groupProgress } from "@/lib/selection";
import { taxiPromoStatusForUser } from "@/lib/taxi";
import { getEmployeeCashback } from "@/lib/cashback";
import { formatSomoni } from "@/lib/cashback-math";
import { couponQrSvg } from "@/lib/qr";
import { safeImageSrc } from "@/lib/safe-url";
import { getLocale, getTranslator } from "@/lib/i18n";
import { CancelItemButton } from "./_cancel-button";
import { CouponTicket, TaxiTicket } from "./_ticket";

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
  const cashback = await getEmployeeCashback(session.employee.id);

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

  // Ориентир по сроку рассмотрения для PENDING-позиций — берём порог первой
  // ступени эскалации (после него уходит напоминание согласующим), чтобы не
  // придумывать отдельное число: сотрудник видит тот же ориентир, на который
  // реально настроена система.
  const slaRule = await db.slaEscalationRule.findFirst({
    where: { level: 1, active: true },
    select: { afterHours: true },
  });

  const allItems = applications.flatMap((a) => a.items);

  // Статус промокода такси по каждой одобренной PHONE_PROMO-позиции — чтобы
  // на месте пустого блока купона не оставался голый бейдж «Одобрено»,
  // неотличимый от QR-льготы, купон по которой ещё просто не выдан.
  const taxiItemIds = allItems
    .filter(
      (i) =>
        !i.coupon &&
        i.card.partner?.deliveryMode === "PHONE_PROMO" &&
        ["APPROVED", "COUPON_CREATED", "COUPON_ISSUED"].includes(i.status),
    )
    .map((i) => i.id);
  const taxiStatusByItem = await taxiPromoStatusForUser(session.user.id, taxiItemIds);
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

      {cashback.length > 0 && (
        <section className="rounded-[20px] border border-line bg-surface p-5">
          <h2 className="text-base font-bold text-ink">{t("cashback.title")}</h2>
          <p className="mt-1 text-xs text-ink-subtle">{t("cashback.hint")}</p>
          <ul className="mt-3 space-y-4">
            {cashback.map((a) => (
              <li key={a.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-ink">{a.partner.name}</span>
                  <span className="font-display text-lg font-bold text-primary" data-numeric>
                    {formatSomoni(a.balance)} {t("cashback.currency")}
                  </span>
                </div>
                {a.entries.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-ink-muted" data-numeric>
                    {a.entries.map((e) => (
                      <li key={e.id} className="flex justify-between gap-3">
                        <span>
                          {e.createdAt.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" })} ·{" "}
                          {e.kind === "ACCRUAL" ? t("cashback.accrued") : t("cashback.redeemed")}
                        </span>
                        <span className={e.kind === "ACCRUAL" ? "text-success-strong" : ""}>
                          {e.kind === "ACCRUAL" ? "+" : "−"}
                          {formatSomoni(e.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
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
              {app.items.map((item) => {
                const isGroup = item.card.minParticipants > 1;
                const groupHave = isGroup ? groupByPeriod.get(app.periodId)?.get(item.cardId) ?? 0 : 0;
                const groupDone = !isGroup || groupHave >= item.card.minParticipants;

                // Купон уже выдан/формируется — показываем билет с QR вместо строки статуса.
                if (item.coupon) {
                  const c = item.coupon;
                  const qr = qrByCoupon.get(c.id) ?? null;
                  const pastValid = isCouponExpired(c.validUntil);
                  const periodPassed = isCouponPeriodPassed(app.period);
                  const expired = isCouponOverdue({ ...c, period: app.period });
                  const live = c.status === "ISSUED" && !expired;
                  // Активированный купон действует до конца срока, затем «истёк».
                  const activatedLive = c.status === "USED" && !pastValid && !periodPassed;
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
                  const validPeriod =
                    groupDone && c.validUntil && (live || c.status === "CREATED")
                      ? `${t("applications.periodShort")}: ${app.period.startDate.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" })} – ${c.validUntil.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" })}`
                      : null;
                  return (
                    <CouponTicket
                      key={item.id}
                      card={item.card}
                      partner={item.card.partner}
                      couponNumber={c.number}
                      qr={qr}
                      validPeriod={validPeriod}
                      hint={hint}
                      live={live}
                      expired={expired}
                      overdueLabel={t("applications.overdue")}
                      activeLabel={t("applications.active")}
                      couponLabel={t("applications.coupon")}
                      contactSupportLabel={t("applications.contactSupport")}
                    />
                  );
                }

                // Одобренная позиция такси — промокод от партнёра (без QR).
                if (
                  item.card.partner?.deliveryMode === "PHONE_PROMO" &&
                  ["APPROVED", "COUPON_CREATED", "COUPON_ISSUED"].includes(item.status)
                ) {
                  const info = taxiStatusByItem.get(item.id) ?? { status: "NONE" as const, promo: null };
                  const phone = (item.contactPhone ?? "").trim() || (session.employee?.phone ?? "").trim();
                  const hint =
                    info.status === "BLOCKED"
                      ? t("applications.taxiHintBlocked")
                      : info.status === "DELIVERED"
                        ? t("applications.taxiHintDelivered")
                        : info.status === "PENDING"
                          ? t("applications.taxiHintPending")
                          : t("applications.taxiHintNone");
                  const statusLabel =
                    info.status === "BLOCKED"
                      ? t("applications.taxiStatusBlocked")
                      : info.status === "DELIVERED"
                        ? t("applications.taxiStatusDelivered")
                        : info.status === "PENDING"
                          ? t("applications.taxiStatusPending")
                          : t("applications.taxiStatusNone");
                  return (
                    <TaxiTicket
                      key={item.id}
                      card={item.card}
                      partner={item.card.partner}
                      phone={phone}
                      promo={info.promo}
                      blocked={info.status === "BLOCKED"}
                      hint={hint}
                      showSupportLink={info.status === "NONE" || info.status === "PENDING"}
                      taxiLabel={t("applications.taxiApproved")}
                      statusLabel={statusLabel}
                      promoBadgeLabel={t("flex.promoBadge")}
                      promoCaptionLabel={t("applications.taxiPromoCaption")}
                      contactSupportLabel={t("applications.contactSupport")}
                    />
                  );
                }

                // Остальные статусы (черновик/на согласовании/отклонено/ждёт группу) — обычная строка.
                return (
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

                        {item.status === "PENDING" && slaRule && (
                          <p className="text-xs text-ink-muted">
                            {t("applications.pendingEta")} {slaRule.afterHours} {t("applications.pendingEtaHours")}
                          </p>
                        )}

                        {isGroup && !["REJECTED", "CANCELLED", "COUPON_ISSUED"].includes(item.status) && (
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
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={STATUS_TONE[item.status] ?? "neutral"}>
                        {itemStatusLabel(locale, item.status)}
                      </Badge>
                      {(item.status === "DRAFT" || item.status === "PENDING") && (
                        <CancelItemButton itemId={item.id} locale={locale} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
