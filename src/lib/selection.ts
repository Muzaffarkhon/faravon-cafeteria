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
 * с начала окна выбора периода (`windowStart`, задаётся админом на странице
 * периода) и до старта самого периода. Раньше начало было зашито как
 * фиксированное «25-е число» — не совпадало с реальным окном, если админ
 * настраивал период на другие даты.
 */
export function cancelWindow(period: Pick<Period, "startDate" | "windowStart">): { start: Date; end: Date } {
  return { start: period.windowStart, end: period.startDate };
}

export function isWithinCancelWindow(
  period: Pick<Period, "startDate" | "windowStart">,
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

/** Карточки, отмеченные сотрудником для автовыбора (§5) — для состояния переключателя на витрине. */
export async function getAutoPickedCardIds(employeeId: string): Promise<Set<string>> {
  const rows = await db.autoPick.findMany({ where: { employeeId }, select: { cardId: true } });
  return new Set(rows.map((r) => r.cardId));
}

/**
 * Применяет сохранённый автовыбор (§5: «сохранить выбор») — вызывается один
 * раз, при первом обращении к ещё не созданной заявке сотрудника на период
 * (см. `(app)/page.tsx`): по порядку сохранения добавляет DRAFT-позиции по
 * льготам из `AutoPick`, пока не достигнут лимит периода. Пропускает
 * PHONE_PROMO-льготы (нужен явный номер телефона — не автоматизируем) и
 * льготы, снятые с публикации/архивированные/выключенные с момента, когда
 * сотрудник их сохранил.
 */
export async function ensureAutoPicks(
  employeeId: string,
  period: Pick<Period, "id" | "maxSelections">,
): Promise<void> {
  const picks = await db.autoPick.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
    include: { card: { include: { partner: true } } },
  });
  const eligible = picks
    .map((p) => p.card)
    .filter(
      (c) =>
        c.block === "FLEX" &&
        c.status === "PUBLISHED" &&
        c.isActive &&
        !c.archivedAt &&
        c.partner?.deliveryMode !== "PHONE_PROMO",
    );
  if (!eligible.length) return;

  const app = await getOrCreateApplication(employeeId, period.id);

  // Тот же приём, что и в toggleSelectionImpl (actions.ts): счёт + создание в
  // одной сериализуемой транзакции — иначе конкурентный вызов (две вкладки)
  // мог бы превысить лимит периода.
  await db.$transaction(
    async (tx) => {
      const current = await tx.applicationItem.findMany({
        where: { applicationId: app.id },
        select: { status: true },
      });
      let remaining = period.maxSelections - countAgainstLimit(current);
      if (remaining <= 0) return;
      for (const c of eligible) {
        if (remaining <= 0) break;
        const created = await tx.applicationItem.createMany({
          data: [{ applicationId: app.id, cardId: c.id, status: "DRAFT" }],
          skipDuplicates: true,
        });
        if (created.count > 0) remaining -= 1;
      }
    },
    { isolationLevel: "Serializable" },
  );
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

export type PreviousPick = { cardId: string; cardTitle: string };

/**
 * Льготы, реально полученные сотрудником в последнем прошлом периоде (§4:
 * «Выбрать как в прошлый раз») — самый свежий период до `beforeStartDate`, в
 * котором у сотрудника есть хотя бы одна позиция в статусе из
 * `GROUP_ISSUE_STATUSES` (одобрена/купон сформирован/выдан — не черновик,
 * не отклонена и не отменена). Только активные FLEX-карточки, которые всё
 * ещё опубликованы — если льготу сняли с публикации, предлагать её повторно
 * нет смысла.
 */
export async function getPreviousPeriodPicks(
  employeeId: string,
  beforeStartDate: Date,
): Promise<PreviousPick[]> {
  const app = await db.application.findFirst({
    where: {
      employeeId,
      period: { startDate: { lt: beforeStartDate } },
      items: { some: { status: { in: [...GROUP_ISSUE_STATUSES] } } },
    },
    orderBy: { period: { startDate: "desc" } },
    include: {
      items: {
        where: { status: { in: [...GROUP_ISSUE_STATUSES] } },
        include: { card: { select: { id: true, title: true, block: true, status: true, isActive: true, archivedAt: true } } },
      },
    },
  });
  if (!app) return [];
  return app.items
    .filter((i) => i.card.block === "FLEX" && i.card.status === "PUBLISHED" && i.card.isActive && !i.card.archivedAt)
    .map((i) => ({ cardId: i.card.id, cardTitle: i.card.title }));
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
