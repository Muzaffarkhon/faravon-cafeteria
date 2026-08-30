import "server-only";
import { db } from "@/lib/db";
import type { CouponStatus } from "@prisma/client";

export type CouponFilters = { periodId?: string; status?: CouponStatus };

const STATUSES: CouponStatus[] = ["CREATED", "ISSUED", "USED", "EXPIRED", "CANCELLED"];
export const isCouponStatus = (v: string): v is CouponStatus => STATUSES.includes(v as CouponStatus);

export async function listCouponRegistry(f: CouponFilters) {
  return db.coupon.findMany({
    where: {
      ...(f.periodId ? { periodId: f.periodId } : {}),
      ...(f.status ? { status: f.status } : {}),
    },
    include: {
      employee: true,
      partner: true,
      period: true,
      item: { include: { card: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export type CouponRegistryRow = Awaited<ReturnType<typeof listCouponRegistry>>[number];
