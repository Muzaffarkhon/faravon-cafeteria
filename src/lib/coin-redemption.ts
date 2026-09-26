import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { spendCoins, reverseSpend, CoinWalletError } from "@/lib/coin-wallet";
import { formCouponForItem, issueCouponIfReady } from "@/lib/coupon-flow";
import { resolveSelectionContext, ensureAutoPicks } from "@/lib/selection";
import { getGamificationEnabled } from "@/lib/gamification-settings";

export class CoinRedemptionError extends Error {}

/** Сколько покупок за монеты в этом периоде уже "заняты" (не CANCELLED/REJECTED). */
async function countCommittedCoinRedemptions(employeeId: string, periodId: string): Promise<number> {
  return db.applicationItem.count({
    where: {
      viaCoins: true,
      application: { employeeId, periodId },
      status: { notIn: ["CANCELLED", "REJECTED"] },
    },
  });
}

/**
 * Синтезирует Application + ApplicationItem (в статусе APPROVED, как будто
 * C&B уже одобрил выбор) под период из `resolveSelectionContext().targetPeriod`
 * (текущий, если ещё не начался, иначе следующий) — это позволяет
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

  // Счёт + создание позиции в одной сериализуемой транзакции — иначе два
  // параллельных redeemWithCoins для одного сотрудника могли бы оба пройти
  // проверку лимита до того, как любой из них создаст свою позицию.
  const item = await db.$transaction(
    async (tx) => {
      const usedCount = await tx.applicationItem.count({
        where: {
          viaCoins: true,
          application: { employeeId: redemption.employeeId, periodId: period.id },
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
      });
      if (usedCount >= period.maxCoinRedemptions) {
        throw new CoinRedemptionError(`Лимит покупок за монеты на этот период (${period.maxCoinRedemptions}) уже использован.`);
      }
      try {
        return await tx.applicationItem.create({
          data: { applicationId: application.id, cardId: redemption.benefitCardId, status: "APPROVED", viaCoins: true },
        });
      } catch (e) {
        // @@unique([applicationId, cardId]) — эта льгота уже выбрана в периоде
        // обычным способом (DRAFT/PENDING/APPROVED...). Без перехвата сотрудник
        // увидел бы сырое сообщение Prisma про constraint violation.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new CoinRedemptionError("Эта льгота уже выбрана в этом периоде обычным способом — купить её ещё и за монеты нельзя.");
        }
        throw e;
      }
    },
    { isolationLevel: "Serializable" },
  );

  try {
    const coupon = await formCouponForItem(item.id, actorId);
    await issueCouponIfReady(coupon.id, actorId);

    await db.coinRedemption.update({
      where: { id: redemptionId },
      data: { couponId: coupon.id, status: "FULFILLED" },
    });
  } catch (e) {
    // Купон не сформировался — снимаем позицию, иначе она бы навсегда занимала
    // слот maxCoinRedemptions, хотя покупка не состоялась (монеты вернёт вызывающий).
    await db.applicationItem.update({ where: { id: item.id }, data: { status: "CANCELLED" } }).catch(() => {});
    throw e;
  }
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
  if (!(await getGamificationEnabled())) throw new CoinRedemptionError("Функция геймификации временно отключена.");
  const card = await db.benefitCard.findUniqueOrThrow({
    where: { id: params.benefitCardId },
    include: { partner: { select: { deliveryMode: true } } },
  });
  if (!card.coinPrice || !card.coinRedemptionMode) {
    throw new CoinRedemptionError("Эта карточка не продаётся за монеты.");
  }
  // Раньше проверялся только UI-фильтр магазина (coinPrice not null + isActive +
  // PUBLISHED + archivedAt null) — прямой вызов action мог купить архивную/DRAFT
  // карточку в обход витрины.
  if (card.status !== "PUBLISHED" || !card.isActive || card.archivedAt) {
    throw new CoinRedemptionError("Эта льгота сейчас недоступна для покупки.");
  }
  if (card.minParticipants > 1) {
    throw new CoinRedemptionError("Групповые льготы нельзя купить за монеты.");
  }
  if (card.partner?.deliveryMode === "PHONE_PROMO") {
    throw new CoinRedemptionError("Эта льгота выдаётся по номеру телефона, купон не формируется.");
  }

  // Ранняя проверка лимита (best-effort — окончательная проверка внутри
  // fulfillRedemption, в транзакции): не тратим монеты впустую, если лимит
  // на этот период уже занят уже подтверждёнными покупками.
  const ctx = await resolveSelectionContext();
  if (ctx.targetPeriod) {
    const used = await countCommittedCoinRedemptions(params.employeeId, ctx.targetPeriod.id);
    if (used >= ctx.targetPeriod.maxCoinRedemptions) {
      throw new CoinRedemptionError(`Лимит покупок за монеты на этот период (${ctx.targetPeriod.maxCoinRedemptions}) уже использован.`);
    }
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
  if (!(await getGamificationEnabled())) throw new CoinRedemptionError("Функция геймификации временно отключена.");
  // Атомарный claim по PENDING (updateMany, не findUnique+update) — иначе два
  // параллельных клика "Одобрить"/"Отклонить" на одну заявку оба прошли бы
  // проверку статуса до того, как любой из них его сменит, и купон/возврат
  // монет мог бы случиться дважды. CoinRedemptionStatus.APPROVED раньше нигде
  // не проставлялся — используем его здесь как маркер "уже забрано в обработку".
  const claimStatus = params.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const claimed = await db.coinRedemption.updateMany({
    where: { id: params.redemptionId, status: "PENDING" },
    data: { status: claimStatus, decidedById: params.actorId, decidedAt: new Date() },
  });
  if (claimed.count === 0) throw new CoinRedemptionError("Заявка уже обработана.");

  if (params.decision === "APPROVE") {
    await fulfillOrCompensate(params.redemptionId, params.actorId);
    await audit({ actorId: params.actorId, action: "COIN_REDEMPTION_APPROVED", entityType: "CoinRedemption", entityId: params.redemptionId });
  } else {
    await reverseSpend({ opKey: `redemption:${params.redemptionId}`, reason: "Заявка на покупку за монеты отклонена" });
    await audit({ actorId: params.actorId, action: "COIN_REDEMPTION_REJECTED", entityType: "CoinRedemption", entityId: params.redemptionId });
  }
}
