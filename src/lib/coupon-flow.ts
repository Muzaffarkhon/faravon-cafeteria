import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";
import { generateCouponNumber } from "@/lib/coupon";
import { groupApprovedCount } from "@/lib/selection";
import { assertTransition } from "@/lib/application-workflow";

/**
 * Формирует купон по одобренной позиции. Idempotent: если купон уже есть —
 * возвращает его. Уведомление отправляется с deferFlush (для массовых операций).
 */
export async function formCouponForItem(itemId: string, actorId: string) {
  const item = await db.applicationItem.findUnique({
    where: { id: itemId },
    include: {
      coupon: true,
      card: { include: { partner: { select: { deliveryMode: true } } } },
      application: { include: { period: true } },
    },
  });
  if (!item) throw new Error("Позиция не найдена.");
  if (item.coupon) return item.coupon;
  // Партнёр работает по номеру телефона (напр. такси) — купон/QR не нужен,
  // промокод рассылает подрядчик через раздел «Промокоды».
  if (item.card.partner?.deliveryMode === "PHONE_PROMO") {
    throw new Error(
      "Льгота этого партнёра выдаётся по номеру телефона — купон и QR не формируются. Промокод отправляет подрядчик.",
    );
  }
  assertTransition(item.status, "COUPON_CREATED", "C_AND_B");

  const number = await generateCouponNumber(item.application.period.startDate);
  const validUntil = item.application.period.endDate;

  const [coupon] = await db.$transaction([
    db.coupon.create({
      data: {
        number,
        itemId: item.id,
        partnerId: item.card.partnerId,
        employeeId: item.application.employeeId,
        periodId: item.application.periodId,
        type: "PROMO",
        // Снимок правил карточки: дальнейшая правка карточки не меняет условия этого купона.
        benefitMode: item.card.mode,
        cashbackPercent: item.card.mode === "CASHBACK" ? item.card.cashbackPercent : null,
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
  // Уведомление сотруднику не шлём здесь — оно одно, при фактической выдаче
  // купона (COUPON_ISSUED). Для негрупповых льгот выдача происходит сразу.
  return coupon;
}

/**
 * Выдаёт купон (CREATED → ISSUED), если для групповой льготы набрана группа
 * либо льгота не групповая. Возвращает true, если выдан. Тихо (без ошибок).
 */
export async function issueCouponIfReady(couponId: string, actorId: string): Promise<boolean> {
  const coupon = await db.coupon.findUnique({
    where: { id: couponId },
    include: {
      item: { include: { card: { include: { partner: { select: { deliveryMode: true } } } } } },
      period: { select: { name: true, startDate: true } },
    },
  });
  if (!coupon || coupon.status !== "CREATED") return false;
  // Партнёр «по номеру телефона» — QR не выдаём (защита для ранее заведённых купонов).
  if (coupon.item.card.partner?.deliveryMode === "PHONE_PROMO") return false;

  const min = coupon.item.card.minParticipants;
  if (min > 1) {
    const have = await groupApprovedCount(coupon.item.cardId, coupon.periodId);
    if (have < min) return false;
  }

  // Атомарный переход купона + позиции в одной транзакции: иначе падение между
  // ними оставляло купон ISSUED, а позицию — в COUPON_CREATED (рассинхрон).
  const claimedOk = await db.$transaction(async (tx) => {
    const claimed = await tx.coupon.updateMany({
      where: { id: couponId, status: "CREATED" },
      data: { status: "ISSUED", issuedAt: new Date() },
    });
    if (claimed.count === 0) return false;
    await tx.applicationItem.update({
      where: { id: coupon.itemId },
      data: { status: "COUPON_ISSUED" },
    });
    return true;
  });
  if (!claimedOk) return false;

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
    payload: {
      card: coupon.item.card.title,
      number: coupon.number,
      period: coupon.period.name,
      validFrom: coupon.period.startDate.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" }),
      validUntil: coupon.validUntil ? coupon.validUntil.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" }) : null,
    },
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
