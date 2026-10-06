import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { couponStatusLabel, isCouponOverdue } from "@/lib/coupon";
import { listCouponRegistry, countCouponRegistry, buildCouponFilters, listTaxiRegistryRows } from "@/lib/coupon-registry";
import { couponColumns, type CouponColKey } from "@/lib/coupon-columns";
import type { TKey } from "@/lib/i18n/dict";
import type { PromoStatus } from "@/lib/taxi";
import { getLocale, getTranslator } from "@/lib/i18n";
import { SmartFilterButton } from "@/components/smart-filter";
import { QuickSearch } from "@/components/quick-search";
import { filterFields } from "@/lib/smart-filter";
import {
  Badge,
  EmptyState,
  RowId,
  SectionTitle,
  Table,
  buttonClass,
  type BadgeTone,
} from "@/components/ui";
import { IssueCouponButton, DeleteCouponButton, ForceRedeemCouponButton } from "./_buttons";
import { BulkIssueProvider, BulkIssueToolbar, CouponSelectCheckbox } from "./_bulk-issue";
import { fmtDate, fmtDateTimeShort } from "@/lib/dushanbe-date";

const MODE_KEY = {
  ONE_TIME: "coupons.mode.ONE_TIME",
  PERIOD: "coupons.mode.PERIOD",
  CASHBACK: "coupons.mode.CASHBACK",
} as const;
const CHANNEL_KEY = { PORTAL: "coupons.channel.PORTAL" } as const;
const MODE_TONE: Record<keyof typeof MODE_KEY, BadgeTone> = { ONE_TIME: "neutral", PERIOD: "accent", CASHBACK: "success" };

const COUPON_STATUS_TONE: Record<string, BadgeTone> = {
  CREATED: "accent",
  ISSUED: "success",
  USED: "neutral",
  EXPIRED: "warning",
  CANCELLED: "muted",
};

// PHONE_PROMO (промокод по телефону: такси и любые другие партнёры) не формирует Coupon — у промокода свой статус
// доставки, не совпадающий с жизненным циклом купона (см. lib/taxi.ts).
const TAXI_STATUS_TONE: Record<PromoStatus, BadgeTone> = {
  NONE: "neutral",
  PENDING: "neutral",
  DELIVERED: "success",
  BLOCKED: "warning",
};
const TAXI_STATUS_KEY: Record<PromoStatus, "applications.taxiStatusNone" | "applications.taxiStatusPending" | "applications.taxiStatusDelivered" | "applications.taxiStatusBlocked"> = {
  NONE: "applications.taxiStatusNone",
  PENDING: "applications.taxiStatusPending",
  DELIVERED: "applications.taxiStatusDelivered",
  BLOCKED: "applications.taxiStatusBlocked",
};

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; [key: string]: string | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "coupons.manage")) redirect("/");

  const locale = await getLocale();
  const t = await getTranslator();

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const PAGE_SIZE = 50;
  const AWAITING_CAP = 200;

  const now = new Date();

  const [periods, partners] = await Promise.all([
    db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, status: true } }),
    db.partner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const cols = couponColumns({
    t: (key) => t(key as TKey),
    statusLabel: (status) => couponStatusLabel(locale, status as Parameters<typeof couponStatusLabel>[1]),
    periods: periods.map((p) => ({ value: p.id, label: p.name })),
    partners: partners.map((p) => ({ value: p.id, label: p.name })),
  });
  const SMART_FIELDS = filterFields(cols);
  const cf = buildCouponFilters(sp);
  const filters = { extraWhere: cf.extraWhere };
  // Купон не нужен: завершённый период (закрыт / срок вышел) ИЛИ партнёр,
  // работающий по номеру телефона (промокод рассылает подрядчик). Сама
  // очередь формирования купонов вынесена на отдельную страницу
  // (/coupons/awaiting) — здесь только счётчик для ссылки на неё.
  const awaitingWhere = {
    status: "APPROVED" as const,
    coupon: null,
    application: { is: { period: { is: { status: { not: "CLOSED" as const }, endDate: { gte: now } } } } },
    NOT: { card: { is: { partner: { is: { deliveryMode: "PHONE_PROMO" as const } } } } },
  };
  const [awaitingTotal, coupons, couponsTotal, taxiRowsRaw] = await Promise.all([
    db.applicationItem.count({ where: awaitingWhere }),
    listCouponRegistry({ ...filters, page, pageSize: PAGE_SIZE }),
    countCouponRegistry(filters),
    listTaxiRegistryRows(cf),
  ]);
  const taxiRows = taxiRowsRaw.slice(0, AWAITING_CAP);
  const pages = Math.max(1, Math.ceil(couponsTotal / PAGE_SIZE));
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") p.set(k, v);
    if (n > 1) p.set("page", String(n));
    const str = p.toString();
    return str ? `/coupons?${str}` : "/coupons";
  };

  const exportQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") exportQuery.set(k, v);
  const exportHref = `/coupons/export${exportQuery.toString() ? `?${exportQuery}` : ""}`;

  return (
    <div data-wide className="space-y-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{t("coupons.title")}</h1>
        <Link href="/coupons/awaiting" className={buttonClass({ variant: "secondary", size: "sm" })}>
          {t("coupons.awaitingTitle")} {awaitingTotal > 0 && `(${awaitingTotal})`} →
        </Link>
      </header>

      <section className="space-y-3">
        <BulkIssueProvider>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle className="text-lg" count={couponsTotal + taxiRows.length}>{t("coupons.registryTitle")}</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            <BulkIssueToolbar locale={locale} />
            <QuickSearch basePath="/coupons" sp={sp} placeholder="Номер, сотрудник, льгота, партнёр…" />
            <a href={exportHref} className={buttonClass({ size: "sm" })}>
              {t("coupons.exportXlsx")}
            </a>
            <SmartFilterButton
              basePath="/coupons"
              params={sp}
              fields={SMART_FIELDS}
              extraParamKeys={[]}
              presets={[{ id: "all", label: "Все записи", values: null }]}
            />
          </div>
        </div>

        {coupons.length === 0 && taxiRows.length === 0 ? (
          <EmptyState>{t("coupons.empty")}</EmptyState>
        ) : (
          <div className="overflow-hidden rounded-[18px] bg-surface shadow-sm">
            <Table stickyHeader>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.key} className={c.className}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* PHONE_PROMO (промокод по телефону) не заводит Coupon — показываем только на 1-й
                    странице, отдельно от пагинации по реальным купонам (см. выше). */}
                {page === 1 &&
                  taxiRows.map((r) => {
                    const periodEnded = r.periodEndDate < now;
                    const cells: Record<CouponColKey, ReactNode> = {
                      select: <td />,
                      id: (
                        <td data-numeric className="whitespace-nowrap">
                          <RowId id={r.itemId} seq={r.seq} />
                        </td>
                      ),
                      number: (
                        <td data-numeric className="whitespace-nowrap">
                          <span className="font-mono text-sm text-ink">{r.promo ?? "—"}</span>
                        </td>
                      ),
                      employee: <td className="whitespace-nowrap text-ink">{r.employee}</td>,
                      cardPartner: (
                        <td className="whitespace-nowrap text-ink">
                          {r.cardTitle}
                          <span className="text-ink-subtle"> · {r.partnerName ?? "—"}</span>
                        </td>
                      ),
                      condition: <td>—</td>,
                      mode: <td>—</td>,
                      delivery: <td className="whitespace-nowrap">{t("partners.byPhone")}</td>,
                      channel: <td>—</td>,
                      period: (
                        <td className="whitespace-nowrap">
                          {r.periodName}
                          {periodEnded && (
                            <span className="ml-1.5 text-xs font-semibold text-warning-strong">{t("coupons.periodEnded")}</span>
                          )}
                        </td>
                      ),
                      createdAt: <td>—</td>,
                      issuedAt: <td>—</td>,
                      activatedAt: <td>—</td>,
                      validUntil: <td data-numeric>{fmtDate(r.periodEndDate)}</td>,
                      status: (
                        <td>
                          <Badge tone={TAXI_STATUS_TONE[r.promoStatus]}>{t(TAXI_STATUS_KEY[r.promoStatus])}</Badge>
                        </td>
                      ),
                      actions: (
                        <td className="text-right">
                          <span className="text-xs text-ink-subtle">{t("coupons.byPhone")}</span>
                        </td>
                      ),
                    };
                    return (
                      <tr key={`taxi-${r.itemId}`}>
                        {cols.map((c) => (
                          <Fragment key={c.key}>{cells[c.key]}</Fragment>
                        ))}
                      </tr>
                    );
                  })}
                {coupons.map((c) => {
                  const overdue = isCouponOverdue(c);
                  const displayStatus = overdue ? "EXPIRED" : c.status;
                  const periodEnded = c.period.endDate < now;
                  const phonePromo = c.partner?.deliveryMode === "PHONE_PROMO";
                  const bulkEligible = c.status === "CREATED" && !phonePromo && !overdue;
                  const cells: Record<CouponColKey, ReactNode> = {
                    select: <td>{bulkEligible && <CouponSelectCheckbox couponId={c.id} />}</td>,
                    id: (
                      <td data-numeric className="whitespace-nowrap">
                        <RowId id={c.id} seq={c.seq} />
                      </td>
                    ),
                    number: (
                      <td data-numeric className="whitespace-nowrap">
                        <span className="font-mono text-sm text-ink">{c.number}</span>
                      </td>
                    ),
                    employee: (
                      <td className="whitespace-nowrap text-ink">
                        {c.employee.fullName}
                        {c.employee.department && <div className="text-xs text-ink-subtle">{c.employee.department}</div>}
                      </td>
                    ),
                    cardPartner: (
                      <td className="whitespace-nowrap text-ink">
                        {c.item.card.title}
                        <span className="text-ink-subtle"> · {c.partner?.name ?? "—"}</span>
                      </td>
                    ),
                    condition: (
                      <td className="max-w-[16rem]">
                        {c.nominal ? (
                          <span className="line-clamp-2 text-sm text-ink-muted" title={c.nominal}>
                            {c.nominal}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    ),
                    mode: (
                      <td className="whitespace-nowrap">
                        <Badge tone={MODE_TONE[c.benefitMode]}>
                          {t(MODE_KEY[c.benefitMode])}
                          {c.benefitMode === "CASHBACK" && c.cashbackPercent != null ? ` ${c.cashbackPercent}%` : ""}
                        </Badge>
                      </td>
                    ),
                    delivery: (
                      <td className="whitespace-nowrap">
                        {c.partner?.deliveryMode === "PHONE_PROMO" ? t("partners.byPhone") : t("partners.byQr")}
                      </td>
                    ),
                    channel: (
                      <td className="whitespace-nowrap">
                        {c.deliveryChannel in CHANNEL_KEY ? t(CHANNEL_KEY[c.deliveryChannel as keyof typeof CHANNEL_KEY]) : c.deliveryChannel}
                      </td>
                    ),
                    period: (
                      <td className="whitespace-nowrap">
                        {c.period.name}
                        {periodEnded && (
                          <span className="ml-1.5 text-xs font-semibold text-warning-strong">{t("coupons.periodEnded")}</span>
                        )}
                      </td>
                    ),
                    createdAt: (
                      <td data-numeric className="whitespace-nowrap">
                        {fmtDateTimeShort(c.createdAt)}
                      </td>
                    ),
                    issuedAt: (
                      <td data-numeric className="whitespace-nowrap">
                        {c.issuedAt ? fmtDateTimeShort(c.issuedAt) : "—"}
                      </td>
                    ),
                    activatedAt: (
                      <td data-numeric className="whitespace-nowrap">
                        {c.activatedAt ? fmtDateTimeShort(c.activatedAt) : "—"}
                      </td>
                    ),
                    validUntil: <td data-numeric>{c.validUntil ? fmtDate(c.validUntil) : "—"}</td>,
                    status: (
                      <td>
                        <Badge tone={COUPON_STATUS_TONE[displayStatus] ?? "neutral"}>
                          {couponStatusLabel(locale, displayStatus)}
                        </Badge>
                      </td>
                    ),
                    actions: (
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.status === "CREATED" &&
                            (phonePromo ? (
                              <span className="text-xs text-ink-subtle">{t("coupons.byPhone")}</span>
                            ) : overdue ? (
                              <span className="text-xs text-ink-subtle">{t("coupons.periodOver")}</span>
                            ) : (
                              <IssueCouponButton couponId={c.id} locale={locale} />
                            ))}
                          {c.status === "ISSUED" && !overdue && c.benefitMode !== "CASHBACK" && (
                            <ForceRedeemCouponButton couponId={c.id} couponNumber={c.number} locale={locale} />
                          )}
                          <DeleteCouponButton couponId={c.id} couponNumber={c.number} locale={locale} />
                        </div>
                      </td>
                    ),
                  };
                  return (
                    <tr key={c.id}>
                      {cols.map((col) => (
                        <Fragment key={col.key}>{cells[col.key]}</Fragment>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
        </BulkIssueProvider>

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">
              {t("coupons.pagePrefix")} {page} {t("coupons.pageOf")} {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={pageHref(page - 1)}
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  {t("coupons.back")}
                </a>
              )}
              {page < pages && (
                <a
                  href={pageHref(page + 1)}
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  {t("coupons.next")}
                </a>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
