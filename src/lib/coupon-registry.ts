import "server-only";
import { db } from "@/lib/db";
import type { CouponStatus, Prisma } from "@prisma/client";
import { parseSmartFilterParams, stringFilter, dateFilter, type SmartFilterField } from "@/lib/smart-filter";

export type CouponFilters = {
  periodId?: string;
  status?: CouponStatus;
  partnerId?: string;
  employeeQuery?: string; // ФИО
  /** доп. условия «умного фильтра» (см. components/smart-filter.tsx), AND'ятся с остальными */
  extraWhere?: Prisma.CouponWhereInput[];
  /** пагинация: если не задана — возвращаются все (для экспорта) */
  page?: number;
  pageSize?: number;
};

const STATUSES: CouponStatus[] = ["CREATED", "ISSUED", "USED", "EXPIRED", "CANCELLED"];
export const isCouponStatus = (v: string): v is CouponStatus => STATUSES.includes(v as CouponStatus);

function couponWhere(f: CouponFilters) {
  const q = f.employeeQuery?.trim();
  return {
    ...(f.periodId ? { periodId: f.periodId } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.partnerId ? { partnerId: f.partnerId } : {}),
    ...(q ? { employee: { fullName: { contains: q, mode: "insensitive" as const } } } : {}),
    ...(f.extraWhere?.length ? { AND: f.extraWhere } : {}),
  };
}

export async function listCouponRegistry(f: CouponFilters) {
  const where = couponWhere(f);
  const paginated = f.page != null && f.pageSize != null;
  return db.coupon.findMany({
    where,
    include: {
      employee: true,
      partner: true,
      period: true,
      item: { include: { card: true } },
    },
    orderBy: { createdAt: "desc" },
    ...(paginated ? { skip: (f.page! - 1) * f.pageSize!, take: f.pageSize! } : {}),
  });
}

export function countCouponRegistry(f: CouponFilters) {
  return db.coupon.count({ where: couponWhere(f) });
}

export type CouponRegistryRow = Awaited<ReturnType<typeof listCouponRegistry>>[number];

// Только key+type — важны для парсинга sf_<key>/sf_<key>_v из query, а не для UI
// (лейблы и options для пикера умного фильтра описаны отдельно в page.tsx).
const COUPON_FILTER_FIELDS: SmartFilterField[] = [
  { key: "number", label: "", type: "text" },
  { key: "employee", label: "", type: "text" },
  { key: "card", label: "", type: "text" },
  { key: "partnerName", label: "", type: "text" },
  { key: "validUntil", label: "", type: "date" },
  { key: "period", label: "", type: "select" },
  { key: "partner", label: "", type: "select" },
  { key: "status", label: "", type: "select" },
];

/** Строит CouponFilters из query-параметров страницы /coupons — общее для самой
 *  страницы и её /coupons/export, чтобы выгрузка всегда отражала то, что видно в таблице. */
export function buildCouponFilters(sp: Record<string, string | undefined>) {
  const smartValues = parseSmartFilterParams(sp, COUPON_FILTER_FIELDS);
  const periodId = smartValues.period?.v;
  const status = smartValues.status?.v && isCouponStatus(smartValues.status.v) ? smartValues.status.v : undefined;
  const partnerId = smartValues.partner?.v;

  const extraWhere: Prisma.CouponWhereInput[] = [];
  const numberF = stringFilter(smartValues.number);
  if (numberF) extraWhere.push({ number: numberF });
  const employeeF = stringFilter(smartValues.employee);
  if (employeeF) extraWhere.push({ employee: { is: { fullName: employeeF } } });
  const cardF = stringFilter(smartValues.card);
  if (cardF) extraWhere.push({ item: { is: { card: { is: { title: cardF } } } } });
  const partnerNameF = stringFilter(smartValues.partnerName);
  if (partnerNameF) extraWhere.push({ partner: { is: { name: partnerNameF } } });
  const validUntilF = dateFilter(smartValues.validUntil);
  if (validUntilF) extraWhere.push({ validUntil: validUntilF });
  const q = (sp.q ?? "").trim();
  if (q) {
    extraWhere.push({
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { employee: { is: { fullName: { contains: q, mode: "insensitive" } } } },
        { item: { is: { card: { is: { title: { contains: q, mode: "insensitive" } } } } } },
        { partner: { is: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  return {
    periodId,
    status,
    partnerId,
    extraWhere,
    q,
    employeeQuery: smartValues.employee?.v?.trim() || undefined,
    /** true — активен фильтр, не совместимый со строками такси (у них нет статуса/номера/срока купона). */
    hasCouponOnlyFilters: !!(status || numberF || validUntilF || cardF || partnerNameF),
  };
}
