import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";
import { normalizePhone } from "@/lib/phone";
import type { CouponStatus } from "@prisma/client";

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  CREATED: "Сформирован",
  ISSUED: "Выдан",
  USED: "Активирован",
  EXPIRED: "Просрочен",
  CANCELLED: "Аннулирован",
};

const normalizeNumber = (n: string) => n.trim().toUpperCase();

/** Купон просрочен, если задан срок и он в прошлом. */
export const isCouponExpired = (validUntil: Date | null, at: Date = new Date()) =>
  !!validUntil && validUntil.getTime() < at.getTime();

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
 * Поиск действующего купона сотрудника по номеру телефона — касса партнёра
 * (§8, без входа в систему). Работает, даже если сотрудник не знает про
 * купон: кассир вводит только телефон.
 *
 * Возвращает купон в статусе ISSUED (самый свежий), ограниченный партнёром
 * гасящего подрядчика, если он задан. `employee: null` — телефон не найден
 * в справочнике; `employee` есть, но `coupon: null` — у сотрудника нет
 * действующей льготы у этого партнёра.
 */
export async function lookupCouponByEmployeePhone(phone: string, actorPartnerId?: string | null) {
  const norm = normalizePhone(phone);
  if (norm.length < 9) return { employee: null, coupon: null };

  const employee = await db.employee.findFirst({
    where: { phoneNormalized: norm, archivedAt: null },
    select: { id: true, fullName: true, department: true },
  });
  if (!employee) return { employee, coupon: null };

  const coupon = await db.coupon.findFirst({
    where: {
      employeeId: employee.id,
      status: "ISSUED",
      ...(actorPartnerId ? { partnerId: actorPartnerId } : {}),
    },
    include: {
      item: { include: { card: { include: { partner: true } } } },
      employee: true,
      partner: true,
      period: true,
    },
    orderBy: { issuedAt: "desc" },
  });
  return { employee, coupon };
}

/**
 * Гашение купона подрядчиком: ISSUED → USED, аудит, уведомление сотруднику.
 * Статус позиции заявки не меняется (COUPON_ISSUED — терминальный).
 *
 * `actorPartnerId` — партнёр гасящего подрядчика: если задан, купон другого
 * партнёра активировать нельзя. null (глобальный подрядчик) — ограничения нет.
 */
export async function redeemCouponByNumber(
  number: string,
  actorId: string,
  actorPartnerId?: string | null,
) {
  const coupon = await db.coupon.findUnique({
    where: { number: normalizeNumber(number) },
    include: { item: { include: { card: true } }, partner: true, period: { select: { name: true } } },
  });
  if (!coupon) throw new Error("Купон с таким номером не найден.");
  if (actorPartnerId && coupon.partnerId !== actorPartnerId) {
    throw new Error(
      `Купон партнёра «${coupon.partner?.name ?? "другого партнёра"}» — вы можете активировать только свои купоны.`,
    );
  }
  if (coupon.status === "USED") throw new Error("Купон уже активирован.");
  if (coupon.status !== "ISSUED") {
    throw new Error(`Купон нельзя активировать: статус «${COUPON_STATUS_LABELS[coupon.status]}».`);
  }

  const now = new Date();
  if (isCouponExpired(coupon.validUntil, now)) {
    // Просрочку раньше никто не проставлял — фиксируем при обращении.
    await db.coupon.updateMany({
      where: { id: coupon.id, status: "ISSUED" },
      data: { status: "EXPIRED" },
    });
    await audit({
      actorId,
      action: "COUPON_EXPIRED",
      entityType: "Coupon",
      entityId: coupon.id,
      oldValue: { status: "ISSUED" },
      newValue: { status: "EXPIRED", number: coupon.number },
    });
    throw new Error(
      `Срок действия купона истёк${coupon.validUntil ? ` ${coupon.validUntil.toLocaleDateString("ru-RU")}` : ""}.`,
    );
  }

  // Атомарный переход ISSUED → USED: условия в WHERE не дают погасить купон
  // дважды при гонке и не дают погасить просроченный.
  const claimed = await db.coupon.updateMany({
    where: {
      id: coupon.id,
      status: "ISSUED",
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
    },
    data: { status: "USED" },
  });
  if (claimed.count === 0) {
    throw new Error("Купон уже активирован или просрочен.");
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
    payload: { number: coupon.number, card: coupon.item.card.title, period: coupon.period.name },
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
