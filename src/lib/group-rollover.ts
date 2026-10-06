import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { groupApprovedCount, isItemWaveReady } from "@/lib/selection";
import { notifyEmployee, flushTelegram } from "@/lib/notify";

/**
 * §6: при закрытии периода групповые льготы, не набравшие порог участников,
 * переносятся в следующий период — выбор сотрудников сохраняется автоматически.
 * Остальные карточки не переносятся: в новом периоде выбор начинается заново.
 * Идемпотентно: повторный вызов не создаёт дублей (перенесённая позиция
 * помечается carriedFromId и защищена уникальностью [applicationId, cardId]).
 */
export async function carryUnfilledGroupSelections(
  closedPeriodId: string,
  actorId?: string | null,
): Promise<{ cards: number; carried: number; skippedNoNextPeriod: boolean }> {
  const closed = await db.period.findUnique({ where: { id: closedPeriodId } });
  if (!closed) return { cards: 0, carried: 0, skippedNoNextPeriod: false };

  const next = await db.period.findFirst({
    where: { startDate: { gt: closed.startDate } },
    orderBy: { startDate: "asc" },
  });
  if (!next) return { cards: 0, carried: 0, skippedNoNextPeriod: true };

  const groupCards = await db.benefitCard.findMany({
    where: { minParticipants: { gt: 1 } },
    select: { id: true, minParticipants: true, title: true, groupWaves: true },
  });

  let cards = 0;
  let carried = 0;

  for (const card of groupCards) {
    const approved = await groupApprovedCount(card.id, closedPeriodId);
    if (!card.groupWaves && approved >= card.minParticipants) continue;

    const candidates = await db.applicationItem.findMany({
      where: {
        cardId: card.id,
        status: { in: ["PENDING", "APPROVED", "COUPON_CREATED"] },
        application: { is: { periodId: closedPeriodId } },
      },
      include: { application: { select: { employeeId: true } } },
    });
    if (candidates.length === 0) continue;

    let items = candidates;
    if (card.groupWaves) {
      const readiness = await Promise.all(
        candidates.map((it) => isItemWaveReady(card.id, closedPeriodId, it.id, card.minParticipants)),
      );
      items = candidates.filter((_, i) => !readiness[i]);
    }
    if (items.length === 0) continue;
    cards++;
    const carriedSourceIds: string[] = [];

    for (const it of items) {
      const employeeId = it.application.employeeId;

      const app = await db.application.upsert({
        where: { employeeId_periodId: { employeeId, periodId: next.id } },
        update: {},
        create: { employeeId, periodId: next.id },
      });

      const exists = await db.applicationItem.findUnique({
        where: { applicationId_cardId: { applicationId: app.id, cardId: card.id } },
      });
      if (exists) continue;

      carriedSourceIds.push(it.id);

      const createdItem = await db.applicationItem.create({
        data: {
          applicationId: app.id,
          cardId: card.id,
          status: "PENDING",
          submittedAt: new Date(),
          contactPhone: it.contactPhone,
          carriedFromId: it.id,
        },
      });
      carried++;

      await audit({
        actorId: actorId ?? null,
        action: "GROUP_SELECTION_CARRIED",
        entityType: "ApplicationItem",
        entityId: createdItem.id,
        oldValue: { fromPeriod: closedPeriodId, fromItem: it.id },
        newValue: { toPeriod: next.id, card: card.title },
      });
      await notifyEmployee({
        employeeId,
        event: "GROUP_CARRIED_OVER",
        payload: { card: card.title, period: next.name },
        deferFlush: true,
      });
    }

    if (carriedSourceIds.length > 0) {
      await db.applicationItem.updateMany({
        where: { id: { in: carriedSourceIds } },
        data: { status: "CANCELLED" },
      });
      await db.coupon.updateMany({
        where: { status: "CREATED", itemId: { in: carriedSourceIds } },
        data: { status: "CANCELLED" },
      });
    }
  }

  if (carried > 0) flushTelegram();
  return { cards, carried, skippedNoNextPeriod: false };
}
