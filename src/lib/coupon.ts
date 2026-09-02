import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";
import type { CouponStatus } from "@prisma/client";

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  CREATED: "Сформирован",
  ISSUED: "Выдан",
  USED: "Использован",
  EXPIRED: "Просрочен",
  CANCELLED: "Аннулирован",
};

const normalizeNumber = (n: string) => n.trim().toUpperCase();

/** Поиск купона по номеру — для экрана подрядчика (§5.8, проверка/гашение). */
export function lookupCouponByNumber(number: string) {
  return db.coupon.findUnique({
    where: { number: normalizeNumber(number) },
    include: {
      item: { include: { card: { include: { partner: true } } } },
      employee: true,
      partner: true,
      period: true,
    },
  });
}

/**
 * Гашение купона подрядчиком: ISSUED → USED, аудит, уведомление сотруднику.
 * Статус позиции заявки не меняется (COUPON_ISSUED — терминальный).
 */
export async function redeemCouponByNumber(number: string, actorId: string) {
  const coupon = await db.coupon.findUnique({
    where: { number: normalizeNumber(number) },
    include: { item: { include: { card: true } } },
  });
  if (!coupon) throw new Error("Купон с таким номером не найден.");
  if (coupon.status === "USED") throw new Error("Купон уже погашен.");
  if (coupon.status !== "ISSUED") {
    throw new Error(`Купон нельзя погасить: статус «${COUPON_STATUS_LABELS[coupon.status]}».`);
  }

  // Атомарный переход ISSUED → USED: условие в WHERE не даёт погасить один
  // купон дважды при гонке (двойной клик, два устройства, один QR).
  const claimed = await db.coupon.updateMany({
    where: { id: coupon.id, status: "ISSUED" },
    data: { status: "USED" },
  });
  if (claimed.count === 0) {
    throw new Error("Купон уже погашен.");
  }

  await audit({
    actorId,
    action: "COUPON_REDEEMED_BY_PROVIDER",
    entityType: "Coupon",
    entityId: coupon.id,
    oldValue: { status: "ISSUED" },
    newValue: { status: "USED", number: coupon.number },
  });
  await notifyEmployee({
    employeeId: coupon.employeeId,
    event: "COUPON_CONFIRMED_BY_PROVIDER",
    payload: { number: coupon.number, card: coupon.item.card.title },
  });
  return coupon;
}

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
