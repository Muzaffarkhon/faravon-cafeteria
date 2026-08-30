import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import type { CouponStatus } from "@prisma/client";

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  CREATED: "Сформирован",
  ISSUED: "Выдан",
  USED: "Использован",
  EXPIRED: "Просрочен",
  CANCELLED: "Аннулирован",
};

/** Уникальный номер купона: FRV-YYYYMM-XXXXXX. */
export async function generateCouponNumber(periodStart: Date): Promise<string> {
  const ym = `${periodStart.getUTCFullYear()}${String(periodStart.getUTCMonth() + 1).padStart(2, "0")}`;
  for (let i = 0; i < 10; i++) {
    const suffix = randomBytes(3).toString("hex").toUpperCase();
    const number = `FRV-${ym}-${suffix}`;
    const clash = await db.coupon.findUnique({ where: { number } });
    if (!clash) return number;
  }
  throw new Error("Не удалось сгенерировать уникальный номер купона.");
}
