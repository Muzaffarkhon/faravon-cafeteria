import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { couponStatusLabel, isCouponOverdue } from "@/lib/coupon";
import { listCouponRegistry, countCouponRegistry, isCouponStatus } from "@/lib/coupon-registry";
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
import { CreateCouponButton, IssueCouponButton, DeleteCouponButton, RejectAwaitingButton } from "./_buttons";

const COUPON_STATUSES = ["CREATED", "ISSUED", "USED", "EXPIRED", "CANCELLED"] as const;

const COUPON_STATUS_TONE: Record<string, BadgeTone> = {
  CREATED: "accent",
  ISSUED: "success",
  USED: "neutral",
  EXPIRED: "warning",
  CANCELLED: "muted",
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
  // Купон не нужен: завершённый период (закрыт / срок вышел) ИЛИ партнёр,
  // работающий по номеру телефона (промокод рассылает подрядчик).
  const awaitingWhere = {
    status: "APPROVED" as const,
    coupon: null,
    application: { is: { period: { is: { status: { not: "CLOSED" as const }, endDate: { gte: now } } } } },
    NOT: { card: { is: { partner: { is: { deliveryMode: "PHONE_PROMO" as const } } } } },
  };

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
  const [awaiting, awaitingTotal, coupons, couponsTotal] = await Promise.all([
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
    listCouponRegistry({ ...filters, page, pageSize: PAGE_SIZE }),
    countCouponRegistry(filters),
  ]);
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
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{t("coupons.title")}</h1>
      </header>

      {/* Одобренные позиции без купона */}
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

      {/* Реестр купонов */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle className="text-lg" count={couponsTotal}>{t("coupons.registryTitle")}</SectionTitle>
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

        {coupons.length === 0 ? (
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
