import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";
import { generateCouponNumber } from "@/lib/coupon";
import { groupProgressOne } from "@/lib/selection";
import { assertTransition } from "@/lib/application-workflow";

/**
 * Формирует купон по одобренной позиции. Idempotent: если купон уже есть —
 * возвращает его. Уведомление отправляется с deferFlush (для массовых операций).
 */
export async function formCouponForItem(itemId: string, actorId: string) {
  const item = await db.applicationItem.findUnique({
    where: { id: itemId },
    include: { coupon: true, card: true, application: { include: { period: true } } },
  });
  if (!item) throw new Error("Позиция не найдена.");
  if (item.coupon) return item.coupon;
  assertTransition(item.status, "COUPON_CREATED", "C_AND_B");

  const number = await generateCouponNumber(item.application.period.startDate);
  const validUntil = new Date(item.application.period.endDate);
  validUntil.setUTCDate(validUntil.getUTCDate() + 30);

  const [coupon] = await db.$transaction([
    db.coupon.create({
      data: {
        number,
        itemId: item.id,
        partnerId: item.card.partnerId,
        employeeId: item.application.employeeId,
        periodId: item.application.periodId,
        type: "PROMO",
        nominal: item.card.condition,
        status: "CREATED",
        deliveryChannel: "PORTAL",
        validUntil,
      },
    }),
    db.applicationItem.update({ where: { id: item.id }, data: { status: "COUPON_CREATED" } }),
  ]);

  await audit({
    actorId,
    action: "COUPON_CREATED",
    entityType: "ApplicationItem",
    entityId: item.id,
    newValue: { number },
  });
  await notifyEmployee({
    employeeId: item.application.employeeId,
    event: "COUPON_CREATED",
    payload: { card: item.card.title, number },
    deferFlush: true,
  });
  return coupon;
}

/**
 * Выдаёт купон (CREATED → ISSUED), если для групповой льготы набрана группа
 * либо льгота не групповая. Возвращает true, если выдан. Тихо (без ошибок).
 */
export async function issueCouponIfReady(couponId: string, actorId: string): Promise<boolean> {
  const coupon = await db.coupon.findUnique({
    where: { id: couponId },
    include: { item: { include: { card: true } } },
  });
  if (!coupon || coupon.status !== "CREATED") return false;

  const min = coupon.item.card.minParticipants;
  if (min > 1) {
    const have = await groupProgressOne(coupon.item.cardId, coupon.periodId);
    if (have < min) return false;
  }

  const claimed = await db.coupon.updateMany({
    where: { id: couponId, status: "CREATED" },
    data: { status: "ISSUED", issuedAt: new Date() },
  });
  if (claimed.count === 0) return false;

  await db.applicationItem.update({
    where: { id: coupon.itemId },
    data: { status: "COUPON_ISSUED" },
  });
  await audit({
    actorId,
    action: "COUPON_ISSUED",
    entityType: "Coupon",
    entityId: couponId,
    newValue: { number: coupon.number },
  });
  await notifyEmployee({
    employeeId: coupon.employeeId,
    event: "COUPON_ISSUED",
    payload: { number: coupon.number },
    deferFlush: true,
  });
  return true;
}

/**
 * Добор для групповой льготы: когда очередной участник добрал группу до порога,
 * выдаём все ранее сформированные (CREATED) купоны этой карточки в периоде.
 */
export async function issueGroupBacklog(cardId: string, periodId: string, actorId: string) {
  const pending = await db.coupon.findMany({
    where: { status: "CREATED", periodId, item: { is: { cardId } } },
    select: { id: true },
  });
  for (const c of pending) {
    await issueCouponIfReady(c.id, actorId);
  }
}
