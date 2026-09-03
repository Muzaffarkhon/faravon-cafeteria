import "server-only";
import { db } from "@/lib/db";
import type { CouponStatus } from "@prisma/client";

export type CouponFilters = {
  periodId?: string;
  status?: CouponStatus;
  partnerId?: string;
  employeeQuery?: string; // ФИО
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
