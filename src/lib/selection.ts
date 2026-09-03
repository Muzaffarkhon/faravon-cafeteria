import "server-only";
import { db } from "@/lib/db";
import { ACTIVE_FOR_LIMIT } from "@/lib/application-workflow";

/** Текущий период с открытым окном выбора (ТЗ v2 §5.7). */
export async function getCurrentPeriod() {
  const now = new Date();
  return db.period.findFirst({
    where: { status: "OPEN" },
    orderBy: { startDate: "desc" },
  }).then((p) => {
    if (!p) return null;
    const windowOpen = p.windowStart <= now && p.windowEnd >= now;
    return { ...p, windowOpen };
  });
}

export async function getOrCreateApplication(employeeId: string, periodId: string) {
  return db.application.upsert({
    where: { employeeId_periodId: { employeeId, periodId } },
    update: {},
    create: { employeeId, periodId },
  });
}

export async function getApplicationWithItems(employeeId: string, periodId: string) {
  return db.application.findUnique({
    where: { employeeId_periodId: { employeeId, periodId } },
    include: {
      items: {
        include: { card: { include: { partner: true } }, coupon: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export function countAgainstLimit(items: { status: string }[]) {
  return items.filter((i) => ACTIVE_FOR_LIMIT.includes(i.status as never)).length;
}

/**
 * Статусы «участия» в групповой льготе для ОТОБРАЖЕНИЯ прогресса набора
 * («X из N выбрали»). Включает ещё не одобренные заявки.
 */
const GROUP_COUNT_STATUSES = ["PENDING", "APPROVED", "COUPON_CREATED", "COUPON_ISSUED"] as const;

/**
 * Статусы, при которых участник РЕАЛЬНО в группе — только одобренные и дальше.
 * По этому счётчику решаем, набралась ли группа для ВЫДАЧИ купонов: пока заявки
 * PENDING, группы ещё нет (их могут отклонить по бюджету).
 */
const GROUP_ISSUE_STATUSES = ["APPROVED", "COUPON_CREATED", "COUPON_ISSUED"] as const;

/**
 * Сколько сотрудников выбрали (подтвердили) каждую из карточек в периоде.
 * Для групповых льгот (§ minParticipants): скидка активна, когда count ≥ minParticipants.
 */
export async function groupProgress(
  cardIds: string[],
  periodId: string,
): Promise<Map<string, number>> {
  if (cardIds.length === 0) return new Map();
  const rows = await db.applicationItem.groupBy({
    by: ["cardId"],
    where: {
      cardId: { in: cardIds },
      status: { in: [...GROUP_COUNT_STATUSES] },
      application: { is: { periodId } },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.cardId, r._count._all]));
}

/** Прогресс набора (для отображения) по одной карточке. */
export async function groupProgressOne(cardId: string, periodId: string): Promise<number> {
  return (await groupProgress([cardId], periodId)).get(cardId) ?? 0;
}

/**
 * Сколько ОДОБРЕННЫХ участников у групповой льготы — по этому числу решается,
 * набралась ли группа для выдачи купонов (§ minParticipants).
 */
export async function groupApprovedCount(cardId: string, periodId: string): Promise<number> {
  const rows = await db.applicationItem.groupBy({
    by: ["cardId"],
    where: {
      cardId,
      status: { in: [...GROUP_ISSUE_STATUSES] },
      application: { is: { periodId } },
    },
    _count: { _all: true },
  });
  return rows[0]?._count._all ?? 0;
}
