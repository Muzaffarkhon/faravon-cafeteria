import "server-only";
import { db } from "@/lib/db";
import type { CouponStatus } from "@prisma/client";

export type CouponFilters = {
  periodId?: string;
  status?: CouponStatus;
  partnerId?: string;
  employeeQuery?: string; // ФИО
};

const STATUSES: CouponStatus[] = ["CREATED", "ISSUED", "USED", "EXPIRED", "CANCELLED"];
export const isCouponStatus = (v: string): v is CouponStatus => STATUSES.includes(v as CouponStatus);

export async function listCouponRegistry(f: CouponFilters) {
  const q = f.employeeQuery?.trim();
  return db.coupon.findMany({
    where: {
      ...(f.periodId ? { periodId: f.periodId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.partnerId ? { partnerId: f.partnerId } : {}),
      ...(q
        ? { employee: { fullName: { contains: q, mode: "insensitive" } } }
        : {}),
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
