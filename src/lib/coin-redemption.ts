import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { spendCoins, reverseSpend, CoinWalletError } from "@/lib/coin-wallet";
import { formCouponForItem, issueCouponIfReady } from "@/lib/coupon-flow";
import { resolveSelectionContext, ensureAutoPicks } from "@/lib/selection";

export class CoinRedemptionError extends Error {}

/**
 * Синтезирует Application + ApplicationItem (в статусе APPROVED, как будто
 * C&B уже одобрил выбор) под самую свежую запись Period — это позволяет
 * переиспользовать существующий формирователь купона без изменений в модели
 * Coupon (которая всегда ссылается на ApplicationItem).
 */
async function fulfillRedemption(redemptionId: string, actorId: string): Promise<void> {
  const redemption = await db.coinRedemption.findUniqueOrThrow({
    where: { id: redemptionId },
    include: { benefitCard: true },
  });

  const ctx = await resolveSelectionContext();
  const period = ctx.targetPeriod;
  if (!period) throw new CoinRedemptionError("Нет открытого периода для выбора льгот — не из чего сформировать купон.");

  const usedCount = await db.applicationItem.count({
    where: {
      viaCoins: true,
      application: { employeeId: redemption.employeeId, periodId: period.id },
      status: { notIn: ["CANCELLED", "REJECTED"] },
    },
  });
  if (usedCount >= period.maxCoinRedemptions) {
    throw new CoinRedemptionError(`Лимит покупок за монеты на этот период (${period.maxCoinRedemptions}) уже использован.`);
  }

  const existingApp = await db.application.findUnique({
    where: { employeeId_periodId: { employeeId: redemption.employeeId, periodId: period.id } },
  });
  if (!existingApp && ctx.windowOpen && !ctx.missingNextPeriod) {
    await ensureAutoPicks(redemption.employeeId, period);
  }
  const application = existingApp
    ?? (await db.application.upsert({
      where: { employeeId_periodId: { employeeId: redemption.employeeId, periodId: period.id } },
      create: { employeeId: redemption.employeeId, periodId: period.id },
      update: {},
    }));
  const item = await db.applicationItem.create({
    data: { applicationId: application.id, cardId: redemption.benefitCardId, status: "APPROVED", viaCoins: true },
  });

  const coupon = await formCouponForItem(item.id, actorId);
  await issueCouponIfReady(coupon.id, actorId);

  await db.coinRedemption.update({
    where: { id: redemptionId },
    data: { couponId: coupon.id, status: "FULFILLED" },
  });
}

/**
 * Оборачивает fulfillRedemption: при падении возвращает списанные монеты,
 * переводит заявку в REJECTED (в enum нет отдельного статуса сбоя) и
 * пробрасывает ошибку дальше, чтобы вызывающий код не решил, что всё прошло успешно.
 */
async function fulfillOrCompensate(redemptionId: string, actorId: string): Promise<void> {
  try {
    await fulfillRedemption(redemptionId, actorId);
  } catch (e) {
    await reverseSpend({
      opKey: `redemption:${redemptionId}`,
      reason: "Не удалось сформировать купон — монеты возвращены",
    });
    await db.coinRedemption.update({
      where: { id: redemptionId },
      data: { status: "REJECTED", decidedById: actorId, decidedAt: new Date() },
    });
    await audit({
      actorId,
      action: "COIN_REDEMPTION_FULFILLMENT_FAILED",
      entityType: "CoinRedemption",
      entityId: redemptionId,
    });
    if (e instanceof Error) throw new CoinRedemptionError(e.message);
    throw new CoinRedemptionError("Не удалось сформировать купон.");
  }
}

/** Покупка карточки за монеты. INSTANT — сразу выдаёт купон. REQUEST — эскроу, ждёт C&B. */
export async function redeemWithCoins(params: {
  employeeId: string;
  benefitCardId: string;
  actorId: string;
}): Promise<{ redemptionId: string; status: "FULFILLED" | "PENDING" }> {
  const card = await db.benefitCard.findUniqueOrThrow({
    where: { id: params.benefitCardId },
    include: { partner: { select: { deliveryMode: true } } },
  });
  if (!card.coinPrice || !card.coinRedemptionMode) {
    throw new CoinRedemptionError("Эта карточка не продаётся за монеты.");
  }
  if (card.minParticipants > 1) {
    throw new CoinRedemptionError("Групповые льготы нельзя купить за монеты.");
  }
  if (card.partner?.deliveryMode === "PHONE_PROMO") {
    throw new CoinRedemptionError("Эта льгота выдаётся по номеру телефона, купон не формируется.");
  }

  const redemption = await db.coinRedemption.create({
    data: {
      employeeId: params.employeeId,
      benefitCardId: params.benefitCardId,
      coinCost: card.coinPrice,
      mode: card.coinRedemptionMode,
      status: "PENDING",
    },
  });

  try {
    await spendCoins({
      employeeId: params.employeeId,
      amount: card.coinPrice,
      reason: `Покупка «${card.title}»`,
      opKey: `redemption:${redemption.id}`,
      redemptionId: redemption.id,
    });
  } catch (e) {
    await db.coinRedemption.delete({ where: { id: redemption.id } });
    if (e instanceof CoinWalletError) throw new CoinRedemptionError(e.message);
    throw e;
  }

  if (card.coinRedemptionMode === "INSTANT") {
    await fulfillOrCompensate(redemption.id, params.actorId);
    await audit({ actorId: params.actorId, action: "COIN_REDEMPTION_FULFILLED", entityType: "CoinRedemption", entityId: redemption.id });
    return { redemptionId: redemption.id, status: "FULFILLED" };
  }

  await audit({ actorId: params.actorId, action: "COIN_REDEMPTION_REQUESTED", entityType: "CoinRedemption", entityId: redemption.id });
  return { redemptionId: redemption.id, status: "PENDING" };
}

/** Решение C&B по заявке REQUEST-режима: одобрить (выдать купон) или отклонить (вернуть монеты). */
export async function decideCoinRedemption(params: {
  redemptionId: string;
  decision: "APPROVE" | "REJECT";
  actorId: string;
}): Promise<void> {
  const redemption = await db.coinRedemption.findUniqueOrThrow({ where: { id: params.redemptionId } });
  if (redemption.status !== "PENDING") throw new CoinRedemptionError("Заявка уже обработана.");

  if (params.decision === "APPROVE") {
    await fulfillOrCompensate(redemption.id, params.actorId);
    await db.coinRedemption.update({
      where: { id: redemption.id },
      data: { decidedById: params.actorId, decidedAt: new Date() },
    });
    await audit({ actorId: params.actorId, action: "COIN_REDEMPTION_APPROVED", entityType: "CoinRedemption", entityId: redemption.id });
  } else {
    await reverseSpend({ opKey: `redemption:${redemption.id}`, reason: "Заявка на покупку за монеты отклонена" });
    await db.coinRedemption.update({
      where: { id: redemption.id },
      data: { status: "REJECTED", decidedById: params.actorId, decidedAt: new Date() },
    });
    await audit({ actorId: params.actorId, action: "COIN_REDEMPTION_REJECTED", entityType: "CoinRedemption", entityId: redemption.id });
  }
}
