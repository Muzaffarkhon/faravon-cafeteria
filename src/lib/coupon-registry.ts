import "server-only";
import { db } from "@/lib/db";
import type { CouponStatus, Prisma } from "@prisma/client";
import { columnFilterValues, columnWhere } from "@/lib/smart-filter";
import { couponColumns, COUPON_STATUSES } from "@/lib/coupon-columns";
import { taxiRegistryRows } from "@/lib/taxi";

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

export const isCouponStatus = (v: string): v is CouponStatus => (COUPON_STATUSES as readonly string[]).includes(v);

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

/** Строки «по номеру телефона» (PHONE_PROMO — без Coupon: такси и другие партнёры с промокодами), видимые в реестре /coupons при этих фильтрах.
 *  Общее для страницы и выгрузки: иначе такси-строки были в таблице, а файл выходил пустым. */
export async function listTaxiRegistryRows(cf: ReturnType<typeof buildCouponFilters>) {
  if (cf.hasCouponOnlyFilters) return [];
  // Эти строки — всегда «по номеру телефона»: фильтр «Выдача = по QR» их скрывает.
  const d = cf.delivery;
  if (d?.v) {
    const phone = d.op === "notContains" ? d.v !== "PHONE_PROMO" : d.v === "PHONE_PROMO";
    if (!phone) return [];
  }
  const rows = await taxiRegistryRows({ periodId: cf.periodId, partnerId: cf.partnerId, employeeQuery: cf.employeeQuery });
  const q = cf.q.toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => `${r.employee} ${r.cardTitle} ${r.partnerName ?? ""}`.toLowerCase().includes(q));
}

/** Фильтры, которые применимы и к строкам «по номеру телефона»; любой другой (в т.ч. новый) скрывает эти строки. */
const TAXI_COMPATIBLE_FILTERS = ["employee", "period", "partner", "delivery"];

/** Строит CouponFilters из query-параметров страницы /coupons — общее для самой
 *  страницы и её /coupons/export, чтобы выгрузка всегда отражала то, что видно в таблице. */
export function buildCouponFilters(sp: Record<string, string | undefined>) {
  const columns = couponColumns();
  const values = columnFilterValues(sp, columns);
  const periodId = values.period?.v;
  const status = values.status?.v && isCouponStatus(values.status.v) ? values.status.v : undefined;
  const partnerId = values.partner?.v;
  const extraWhere: Prisma.CouponWhereInput[] = columnWhere(sp, columns);
  const q = (sp.q ?? "").trim();
  if (q) {
    extraWhere.push({
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { employee: { is: { fullName: { contains: q, mode: "insensitive" } } } },
        { item: { is: { card: { is: { title: { contains: q, mode: "insensitive" } } } } } },
        { partner: { is: { name: { contains: q, mode: "insensitive" } } } },
        // «191» или «#191» — поиск по ID строки
        ...(/^#?\d{1,9}$/.test(q) ? [{ seq: Number(q.replace("#", "")) }] : []),
      ],
    });
  }

  return {
    periodId,
    status,
    partnerId,
    extraWhere,
    q,
    employeeQuery: values.employee?.v?.trim() || undefined,
    delivery: values.delivery,
    /** true — активен фильтр, не совместимый со строками такси (у них нет статуса/номера/срока купона). */
    hasCouponOnlyFilters: Object.keys(values).some((k) => !TAXI_COMPATIBLE_FILTERS.includes(k)),
  };
}
