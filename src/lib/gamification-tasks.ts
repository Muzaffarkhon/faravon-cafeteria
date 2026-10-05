import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { creditCoins } from "@/lib/coin-wallet";
import { redeemWithCoins } from "@/lib/coin-redemption";
import { getGamificationEnabled } from "@/lib/gamification-settings";
import { getCurrentPeriod } from "@/lib/selection";
import type { GamificationAutoMetric } from "@prisma/client";

export class GamificationTaskError extends Error {}

/** Общий кулдаун после отмены задачи, прежде чем можно взять любую другую (мс). */
const REJOIN_COOLDOWN_MS = 60 * 60 * 1000;

function scopeMatches(employee: { id: string; department: string }) {
  return {
    OR: [
      { scope: "ALL" as const },
      { scope: "DEPARTMENT" as const, department: employee.department },
      { scope: "SPECIFIC" as const, employeeIds: { has: employee.id } },
    ],
  };
}

/** Активные задачи, доступные сотруднику по scope, которые он ещё не взял (или уже
 *  отменил, но в текущем периоде — отменённая задача возвращается в список только
 *  когда открывается другой период льгот). */
export async function listAvailableTasksForEmployee(employeeId: string) {
  const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, department: true } });
  const now = new Date();
  const currentPeriodId = (await getCurrentPeriod())?.id ?? null;
  return db.gamificationTask.findMany({
    where: {
      isActive: true,
      startsAt: { lte: now },
      employeeTasks: {
        none: {
          employeeId,
          OR: [
            { status: { in: ["IN_PROGRESS", "COMPLETED"] } },
            { status: "CANCELLED", cancelledPeriodId: currentPeriodId },
          ],
        },
      },
      AND: [scopeMatches(employee), { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Сколько ещё ждать (мс), прежде чем сотрудник сможет снова взять любую задачу
 *  после последней отмены; null — кулдауна нет. */
export async function getRejoinCooldownRemaining(employeeId: string): Promise<number | null> {
  const last = await db.employeeTask.findFirst({
    where: { employeeId, status: "CANCELLED" },
    orderBy: { cancelledAt: "desc" },
    select: { cancelledAt: true },
  });
  if (!last?.cancelledAt) return null;
  const remaining = last.cancelledAt.getTime() + REJOIN_COOLDOWN_MS - Date.now();
  return remaining > 0 ? remaining : null;
}

/** Задачи, которые сотрудник уже взял (в работе или завершённые), с данными шаблона.
 *  Отменённые сюда не попадают — отмена убирает задачу из «Моих» насовсем. */
export function listEmployeeTasks(employeeId: string) {
  return db.employeeTask.findMany({
    where: { employeeId, status: { not: "CANCELLED" } },
    include: { task: true },
    orderBy: { joinedAt: "desc" },
  });
}

export async function joinTask(params: { employeeId: string; taskId: string; prizeCardId?: string | null }): Promise<void> {
  if (!(await getGamificationEnabled())) throw new GamificationTaskError("Функция геймификации временно отключена.");
  const cooldown = await getRejoinCooldownRemaining(params.employeeId);
  if (cooldown != null) {
    const minutes = Math.ceil(cooldown / 60_000);
    throw new GamificationTaskError(`После отмены задачи новый выбор доступен через ${minutes} мин.`);
  }
  const task = await db.gamificationTask.findUnique({ where: { id: params.taskId } });
  if (!task || !task.isActive) throw new GamificationTaskError("Задача недоступна.");
  const now = new Date();
  if (task.startsAt > now || (task.endsAt && task.endsAt < now)) {
    throw new GamificationTaskError("Задача недоступна.");
  }
  const employee = await db.employee.findUniqueOrThrow({ where: { id: params.employeeId }, select: { id: true, department: true } });
  const inScope =
    task.scope === "ALL" ||
    (task.scope === "DEPARTMENT" && task.department === employee.department) ||
    (task.scope === "SPECIFIC" && task.employeeIds.includes(employee.id));
  if (!inScope) throw new GamificationTaskError("Задача недоступна.");
  if (params.prizeCardId) {
    const card = await db.benefitCard.findUnique({
      where: { id: params.prizeCardId },
      select: { coinPrice: true, status: true, isActive: true, archivedAt: true },
    });
    if (!card?.coinPrice) throw new GamificationTaskError("Выбранный приз не продаётся за монеты.");
    if (card.status !== "PUBLISHED" || !card.isActive || card.archivedAt) {
      throw new GamificationTaskError("Выбранный приз сейчас недоступен.");
    }
  }
  const existing = await db.employeeTask.findUnique({
    where: { employeeId_taskId: { employeeId: params.employeeId, taskId: params.taskId } },
  });
  if (existing) {
    // Отменённая в ПРОШЛОМ периоде задача возвращается: та же строка (уникальность
    // employeeId+taskId не позволяет создать вторую) переиспользуется как новая попытка.
    const currentPeriodId = (await getCurrentPeriod())?.id ?? null;
    if (existing.status !== "CANCELLED" || existing.cancelledPeriodId === currentPeriodId) {
      throw new GamificationTaskError("Вы уже взяли эту задачу.");
    }
    await db.employeeTask.update({
      where: { id: existing.id },
      data: {
        status: "IN_PROGRESS",
        progressValue: 0,
        prizeCardId: params.prizeCardId ?? null,
        joinedAt: new Date(),
        completedAt: null,
        confirmedById: null,
        cancelledAt: null,
        cancelledPeriodId: null,
      },
    });
    return;
  }

  await db.employeeTask.create({
    data: { employeeId: params.employeeId, taskId: params.taskId, prizeCardId: params.prizeCardId ?? null },
  });
}

/** Сотрудник отменяет свою задачу в работе. Убирает её из «Моих» насовсем; в
 *  «Доступных» она вернётся только когда откроется другой период льгот (см.
 *  listAvailableTasksForEmployee). Общий кулдаун на выбор новой задачи — 1 час. */
export async function cancelTask(params: { employeeId: string; employeeTaskId: string }): Promise<void> {
  const et = await db.employeeTask.findUnique({ where: { id: params.employeeTaskId } });
  if (!et || et.employeeId !== params.employeeId) throw new GamificationTaskError("Задача не найдена.");
  if (et.status !== "IN_PROGRESS") throw new GamificationTaskError("Отменить можно только задачу в работе.");
  const currentPeriodId = (await getCurrentPeriod())?.id ?? null;
  await db.employeeTask.update({
    where: { id: et.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledPeriodId: currentPeriodId },
  });
}

/**
 * Начисляет монеты за завершённую задачу; если выбран приз заранее — сразу тратит их на него.
 *
 * `actorId` должен быть настоящим `User.id` (foreign key в AuditLog/CoinRedemption) —
 * не строковый плейсхолдер. Если у сотрудника нет привязанного User (граничный случай),
 * приз за монеты не покупается автоматически, но монеты всё равно начисляются.
 */
async function rewardCompletedTask(employeeTaskId: string): Promise<void> {
  const et = await db.employeeTask.findUniqueOrThrow({
    where: { id: employeeTaskId },
    include: { task: true, employee: { include: { user: true } } },
  });
  await creditCoins({
    employeeId: et.employeeId,
    amount: et.task.coinReward,
    reason: `Задача «${et.task.title}» выполнена`,
    opKey: `task-reward:${et.id}`,
    taskId: et.taskId,
  });
  if (et.prizeCardId) {
    const actorId = et.employee.user?.id;
    if (actorId) {
      await redeemWithCoins({ employeeId: et.employeeId, benefitCardId: et.prizeCardId, actorId });
    }
  }
}

/** C&B вручную отмечает задачу выполненной (verification = MANUAL). */
export async function completeEmployeeTaskManual(params: { employeeTaskId: string; actorId: string }): Promise<void> {
  if (!(await getGamificationEnabled())) throw new GamificationTaskError("Функция геймификации временно отключена.");
  const et = await db.employeeTask.findUniqueOrThrow({ where: { id: params.employeeTaskId }, include: { task: true } });
  if (et.task.verification !== "MANUAL") throw new GamificationTaskError("Эта задача проверяется автоматически.");

  // Атомарный claim по IN_PROGRESS — иначе двойной клик "Подтвердить" мог бы
  // дважды пройти rewardCompletedTask (двойное начисление монет само по себе
  // idempotent по opKey, но двойная покупка выбранного заранее приза — нет).
  const claimed = await db.employeeTask.updateMany({
    where: { id: et.id, status: "IN_PROGRESS" },
    data: { status: "COMPLETED", completedAt: new Date(), confirmedById: params.actorId },
  });
  if (claimed.count === 0) throw new GamificationTaskError("Задача уже закрыта.");

  await rewardCompletedTask(et.id);
  await audit({ actorId: params.actorId, action: "GAMIFICATION_TASK_COMPLETED", entityType: "EmployeeTask", entityId: et.id });
}

async function computeAutoProgress(metric: GamificationAutoMetric, employeeId: string, since: Date): Promise<number> {
  switch (metric) {
    case "APPLICATIONS_SUBMITTED":
      return db.applicationItem.count({
        where: { application: { is: { employeeId } }, status: { not: "DRAFT" }, viaCoins: false, createdAt: { gte: since } },
      });
    case "COUPONS_USED":
      // item.viaCoins: false — купон, выданный за покупку самих монет, не должен
      // засчитываться в задачу на использование купонов (тот же путь фарма, что
      // и у APPLICATIONS_SUBMITTED).
      return db.coupon.count({
        where: { employeeId, status: "USED", updatedAt: { gte: since }, item: { viaCoins: false } },
      });
    case "FEEDBACK_GIVEN":
      return db.satisfactionResponse.count({ where: { employeeId, createdAt: { gte: since } } });
    case "SURVEYS_COMPLETED":
      return db.surveyResponse.count({ where: { employeeId, createdAt: { gte: since } } });
    case "NEWS_READ":
      return db.newsRead.count({ where: { user: { is: { employeeId } }, readAt: { gte: since } } });
  }
}

type InProgressAutoTask = { id: string; employeeId: string; joinedAt: Date; task: { autoMetric: GamificationAutoMetric | null; targetValue: number | null } };

/**
 * Проверяет и, если порог достигнут, атомарно завершает ОДНУ авто-задачу.
 * Общая логика для мгновенной проверки (сразу после события) и ночного
 * крона (подстраховка на случай, если мгновенный вызов не случился).
 */
async function checkAndCompleteAutoTask(et: InProgressAutoTask): Promise<boolean> {
  if (!et.task.autoMetric || et.task.targetValue == null) return false;
  const progressValue = await computeAutoProgress(et.task.autoMetric, et.employeeId, et.joinedAt);
  const reachedTarget = progressValue >= et.task.targetValue;
  if (!reachedTarget) {
    await db.employeeTask.update({ where: { id: et.id }, data: { progressValue } });
    return false;
  }
  // Атомарный claim по IN_PROGRESS — на случай, если мгновенная проверка и
  // ночной крон (или два мгновенных вызова подряд) пересеклись во времени
  // (см. rewardCompletedTask: двойная покупка приза не idempotent).
  const claimed = await db.employeeTask.updateMany({
    where: { id: et.id, status: "IN_PROGRESS" },
    data: { progressValue, status: "COMPLETED", completedAt: new Date() },
  });
  if (claimed.count === 0) return false;
  await rewardCompletedTask(et.id);
  await audit({ actorId: null, action: "GAMIFICATION_TASK_COMPLETED", entityType: "EmployeeTask", entityId: et.id, newValue: { auto: true } });
  return true;
}

/**
 * Мгновенная проверка авто-задач сотрудника по ОДНОЙ метрике — вызывается
 * сразу после события (заявка подана, купон погашен, отзыв оставлен), а не
 * только ночным кроном. Крон (`recomputeAutoTasks`) остаётся как страховка:
 * ловит то, что могло быть пропущено (ручная правка в БД, будущий код,
 * забывший вызвать эту функцию).
 */
export async function checkAutoTasksForEmployee(employeeId: string, metric: GamificationAutoMetric): Promise<void> {
  if (!(await getGamificationEnabled())) return;
  const inProgress = await db.employeeTask.findMany({
    where: { employeeId, status: "IN_PROGRESS", task: { is: { verification: "AUTO", autoMetric: metric } } },
    include: { task: { select: { autoMetric: true, targetValue: true } } },
  });
  for (const et of inProgress) {
    try {
      await checkAndCompleteAutoTask(et);
    } catch (e) {
      await audit({
        actorId: null,
        action: "GAMIFICATION_TASK_AUTO_FAILED",
        entityType: "EmployeeTask",
        entityId: et.id,
        newValue: { error: e instanceof Error ? e.message : String(e) },
      }).catch(() => {});
    }
  }
}

/** Пересчёт прогресса всех AUTO-задач в работе. Вызывается cron-роутом раз в сутки — страховка на случай, если мгновенная проверка (checkAutoTasksForEmployee) не сработала. */
export async function recomputeAutoTasks(): Promise<{ checked: number; completed: number; failed: number }> {
  if (!(await getGamificationEnabled())) return { checked: 0, completed: 0, failed: 0 };
  const inProgress = await db.employeeTask.findMany({
    where: { status: "IN_PROGRESS", task: { is: { verification: "AUTO" } } },
    include: { task: { select: { autoMetric: true, targetValue: true } } },
  });

  let completed = 0;
  let failed = 0;
  for (const et of inProgress) {
    if (!et.task.autoMetric || et.task.targetValue == null) continue;
    // try/catch на итерацию — иначе один сотрудник со сбоем (например,
    // недостаточно монет на автопокупку заранее выбранного приза) прерывал бы
    // весь суточный прогон, оставляя непроверенными всех остальных в списке.
    try {
      if (await checkAndCompleteAutoTask(et)) completed += 1;
    } catch (e) {
      failed += 1;
      await audit({
        actorId: null,
        action: "GAMIFICATION_TASK_AUTO_FAILED",
        entityType: "EmployeeTask",
        entityId: et.id,
        newValue: { error: e instanceof Error ? e.message : String(e) },
      }).catch(() => {});
    }
  }
  return { checked: inProgress.length, completed, failed };
}
