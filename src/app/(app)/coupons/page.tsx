import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { couponStatusLabel, isCouponOverdue } from "@/lib/coupon";
import { listCouponRegistry, countCouponRegistry, isCouponStatus } from "@/lib/coupon-registry";
import { taxiRegistryRows, type PromoStatus } from "@/lib/taxi";
import { getLocale, getTranslator } from "@/lib/i18n";
import { SmartFilterButton } from "@/components/smart-filter";
import { QuickSearch } from "@/components/quick-search";
import { parseSmartFilterParams, stringFilter, dateFilter, type SmartFilterField } from "@/lib/smart-filter";
import {
  Badge,
  EmptyState,
  RowId,
  SectionTitle,
  Table,
  buttonClass,
  type BadgeTone,
} from "@/components/ui";
import { IssueCouponButton, DeleteCouponButton } from "./_buttons";

const COUPON_STATUSES = ["CREATED", "ISSUED", "USED", "EXPIRED", "CANCELLED"] as const;

const COUPON_STATUS_TONE: Record<string, BadgeTone> = {
  CREATED: "accent",
  ISSUED: "success",
  USED: "neutral",
  EXPIRED: "warning",
  CANCELLED: "muted",
};

// PHONE_PROMO (такси) не формирует Coupon — у промокода свой статус
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

  const SMART_FIELDS: SmartFilterField[] = [
    { key: "number", label: "Номер купона", type: "text" },
    { key: "employee", label: t("coupons.colEmployee"), type: "text" },
    { key: "card", label: "Льгота", type: "text" },
    { key: "partnerName", label: "Партнёр", type: "text" },
    { key: "validUntil", label: "Действует до", type: "date" },
    { key: "period", label: t("coupons.colPeriod"), type: "select", options: periods.map((p) => ({ value: p.id, label: p.name })) },
    { key: "partner", label: t("coupons.allPartners"), type: "select", options: partners.map((p) => ({ value: p.id, label: p.name })) },
    {
      key: "status",
      label: t("coupons.statusLabel"),
      type: "select",
      options: COUPON_STATUSES.map((value) => ({ value, label: couponStatusLabel(locale, value) })),
    },
  ];
  const smartValues = parseSmartFilterParams(sp, SMART_FIELDS);
  const periodId = smartValues.period?.v;
  const status = smartValues.status?.v && isCouponStatus(smartValues.status.v) ? smartValues.status.v : undefined;
  const partnerId = smartValues.partner?.v;

  const smartFilters: Prisma.CouponWhereInput[] = [];
  const numberF = stringFilter(smartValues.number);
  if (numberF) smartFilters.push({ number: numberF });
  const employeeF = stringFilter(smartValues.employee);
  if (employeeF) smartFilters.push({ employee: { is: { fullName: employeeF } } });
  const cardF = stringFilter(smartValues.card);
  if (cardF) smartFilters.push({ item: { is: { card: { is: { title: cardF } } } } });
  const partnerNameF = stringFilter(smartValues.partnerName);
  if (partnerNameF) smartFilters.push({ partner: { is: { name: partnerNameF } } });
  const validUntilF = dateFilter(smartValues.validUntil);
  if (validUntilF) smartFilters.push({ validUntil: validUntilF });
  const q = (sp.q ?? "").trim();
  if (q) {
    smartFilters.push({
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { employee: { is: { fullName: { contains: q, mode: "insensitive" } } } },
        { item: { is: { card: { is: { title: { contains: q, mode: "insensitive" } } } } } },
        { partner: { is: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  const filters = { periodId, status, partnerId, extraWhere: smartFilters };
  // Купон/QR для PHONE_PROMO (такси) принципиально не формируется — у этих
  // позиций нет статуса/номера купона, поэтому фильтры, завязанные именно на
  // купон (статус, номер, срок действия, льгота, партнёр по названию), для
  // них не применимы. Показываем такси-строки только когда активны только
  // совместимые фильтры (период/партнёр/сотрудник/быстрый поиск).
  const taxiFiltersCompatible = !status && !numberF && !validUntilF && !cardF && !partnerNameF;
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
    taxiFiltersCompatible
      ? taxiRegistryRows({ periodId, partnerId, employeeQuery: smartValues.employee?.v?.trim() || undefined })
      : Promise.resolve([]),
  ]);
  const qLower = q.toLowerCase();
  const taxiRows = taxiRowsRaw
    .filter((r) => {
      if (!qLower) return true;
      const hay = `${r.employee} ${r.cardTitle} ${r.partnerName ?? ""}`.toLowerCase();
      return hay.includes(qLower);
    })
    .slice(0, AWAITING_CAP);
  const pages = Math.max(1, Math.ceil(couponsTotal / PAGE_SIZE));
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") p.set(k, v);
    if (n > 1) p.set("page", String(n));
    const str = p.toString();
    return str ? `/coupons?${str}` : "/coupons";
  };

  const exportQuery = new URLSearchParams();
  if (periodId) exportQuery.set("period", periodId);
  if (status) exportQuery.set("status", status);
  if (partnerId) exportQuery.set("partner", partnerId);
  if (smartValues.employee?.v) exportQuery.set("emp", smartValues.employee.v);
  const exportHref = `/coupons/export${exportQuery.toString() ? `?${exportQuery}` : ""}`;

  return (
    <div data-wide className="space-y-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{t("coupons.title")}</h1>
        <Link href="/coupons/awaiting" className={buttonClass({ variant: "secondary", size: "sm" })}>
          {t("coupons.awaitingTitle")} {awaitingTotal > 0 && `(${awaitingTotal})`} →
        </Link>
      </header>

      {/* Реестр купонов */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle className="text-lg" count={couponsTotal + taxiRows.length}>{t("coupons.registryTitle")}</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
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
                  <th>{t("coupons.colNumber")}</th>
                  <th>{t("coupons.colEmployee")}</th>
                  <th>{t("coupons.colCardPartner")}</th>
                  <th>{t("coupons.colPeriod")}</th>
                  <th>{t("coupons.colValidUntil")}</th>
                  <th>{t("coupons.colStatus")}</th>
                  <th className="text-right">{t("coupons.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {/* PHONE_PROMO (такси) не заводит Coupon — показываем только на 1-й
                    странице, отдельно от пагинации по реальным купонам (см. выше). */}
                {page === 1 &&
                  taxiRows.map((r) => {
                    const periodEnded = r.periodStatus === "CLOSED" || r.periodEndDate < now;
                    return (
                      <tr key={`taxi-${r.itemId}`}>
                        <td data-numeric>
                          <div className="font-mono text-sm text-ink">{r.promo ?? "—"}</div>
                          <RowId id={r.itemId} seq={r.seq} className="mt-0.5" />
                        </td>
                        <td className="text-ink">{r.employee}</td>
                        <td className="text-ink">
                          {r.cardTitle}
                          <span className="text-ink-subtle"> · {r.partnerName ?? "—"}</span>
                        </td>
                        <td>
                          {r.periodName}
                          {periodEnded && (
                            <span className="ml-1.5 text-xs font-semibold text-warning-strong">{t("coupons.periodEnded")}</span>
                          )}
                        </td>
                        <td data-numeric>{r.periodEndDate.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" })}</td>
                        <td>
                          <Badge tone={TAXI_STATUS_TONE[r.promoStatus]}>{t(TAXI_STATUS_KEY[r.promoStatus])}</Badge>
                        </td>
                        <td className="text-right">
                          <span className="text-xs text-ink-subtle">{t("coupons.byPhone")}</span>
                        </td>
                      </tr>
                    );
                  })}
                {coupons.map((c) => {
                  const overdue = isCouponOverdue(c);
                  const displayStatus = overdue ? "EXPIRED" : c.status;
                  const periodEnded = c.period.status === "CLOSED" || c.period.endDate < now;
                  const phonePromo = c.partner?.deliveryMode === "PHONE_PROMO";
                  return (
                    <tr key={c.id}>
                      <td data-numeric>
                        <div className="font-mono text-sm text-ink">{c.number}</div>
                        <RowId id={c.id} seq={c.seq} className="mt-0.5" />
                      </td>
                      <td className="text-ink">{c.employee.fullName}</td>
                      <td className="text-ink">
                        {c.item.card.title}
                        <span className="text-ink-subtle"> · {c.partner?.name ?? "—"}</span>
                      </td>
                      <td>
                        {c.period.name}
                        {periodEnded && (
                          <span className="ml-1.5 text-xs font-semibold text-warning-strong">{t("coupons.periodEnded")}</span>
                        )}
                      </td>
                      <td data-numeric>
                        {c.validUntil ? c.validUntil.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" }) : "—"}
                      </td>
                      <td>
                        <Badge tone={COUPON_STATUS_TONE[displayStatus] ?? "neutral"}>
                          {couponStatusLabel(locale, displayStatus)}
                        </Badge>
                      </td>
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
                          <DeleteCouponButton couponId={c.id} couponNumber={c.number} locale={locale} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}

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
