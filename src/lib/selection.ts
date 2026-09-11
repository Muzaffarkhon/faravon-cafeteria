import "server-only";
import { db } from "@/lib/db";
import type { Period } from "@prisma/client";
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

// Таджикистан: UTC+5, без переходов на летнее время (как в admin/periods/actions.ts).
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Инстант для местной даты Душанбе (m — 0-based). */
export function dushanbeInstant(y: number, m: number, day: number, h = 0, min = 0): Date {
  return new Date(Date.UTC(y, m, day, h, min) - TZ_OFFSET_MS);
}

/** Календарные Y/M по времени Душанбе. */
export function dushanbeYM(d: Date): { y: number; m: number } {
  const local = new Date(d.getTime() + TZ_OFFSET_MS);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() };
}

/**
 * Окно отмены выбора (§6): сотрудник может отменить уже отправленную позицию
 * только с 25-го числа месяца, предшествующего началу периода, и до старта периода.
 */
export function cancelWindow(period: Pick<Period, "startDate">): { start: Date; end: Date } {
  const { y, m } = dushanbeYM(period.startDate);
  return { start: dushanbeInstant(y, m - 1, 25), end: period.startDate };
}

export function isWithinCancelWindow(
  period: Pick<Period, "startDate">,
  now: Date = new Date(),
): boolean {
  const w = cancelWindow(period);
  return now >= w.start && now < w.end;
}

export type SelectionContext = {
  /** Период, чьё окно выбора открыто сейчас (status OPEN). */
  windowPeriod: (Period & { windowOpen: boolean }) | null;
  /** Период, в который фактически попадёт новый выбор. */
  targetPeriod: Period | null;
  windowOpen: boolean;
  /** true — окно открыто, но период уже начался: выбор уходит в следующий месяц. */
  rolledOver: boolean;
  /** true — rolledOver, но следующий период ещё не заведён в системе. */
  missingNextPeriod: boolean;
};

/**
 * Куда попадёт выбор сотрудника (§2): пока период ещё не начался — в него самого;
 * если окно всё ещё открыто, а период уже стартовал — в следующий период.
 */
export async function resolveSelectionContext(now: Date = new Date()): Promise<SelectionContext> {
  const windowPeriod = await getCurrentPeriod();
  if (!windowPeriod) {
    return {
      windowPeriod: null,
      targetPeriod: null,
      windowOpen: false,
      rolledOver: false,
      missingNextPeriod: false,
    };
  }

  if (now < windowPeriod.startDate) {
    return {
      windowPeriod,
      targetPeriod: windowPeriod,
      windowOpen: windowPeriod.windowOpen,
      rolledOver: false,
      missingNextPeriod: false,
    };
  }

  // Период уже начался — новый выбор переносим на следующий.
  const next = await db.period.findFirst({
    where: { startDate: { gt: windowPeriod.startDate }, status: { not: "CLOSED" } },
    orderBy: { startDate: "asc" },
  });
  return {
    windowPeriod,
    targetPeriod: next,
    windowOpen: windowPeriod.windowOpen,
    rolledOver: true,
    missingNextPeriod: !next,
  };
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
