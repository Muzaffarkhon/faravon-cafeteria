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

/** Статусы позиции, которые считаются «участием» в групповой льготе. */
const GROUP_COUNT_STATUSES = ["PENDING", "APPROVED", "COUPON_CREATED", "COUPON_ISSUED"] as const;

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

/** Прогресс по одной карточке. */
export async function groupProgressOne(cardId: string, periodId: string): Promise<number> {
  return (await groupProgress([cardId], periodId)).get(cardId) ?? 0;
}
