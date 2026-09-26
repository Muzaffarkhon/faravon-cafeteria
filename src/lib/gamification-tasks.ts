import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { creditCoins } from "@/lib/coin-wallet";
import { redeemWithCoins } from "@/lib/coin-redemption";
import type { GamificationAutoMetric } from "@prisma/client";

export class GamificationTaskError extends Error {}

function scopeMatches(employee: { id: string; department: string }) {
  return {
    OR: [
      { scope: "ALL" as const },
      { scope: "DEPARTMENT" as const, department: employee.department },
      { scope: "SPECIFIC" as const, employeeIds: { has: employee.id } },
    ],
  };
}

/** Активные задачи, доступные сотруднику по scope, которые он ещё не взял. */
export async function listAvailableTasksForEmployee(employeeId: string) {
  const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, department: true } });
  const now = new Date();
  return db.gamificationTask.findMany({
    where: {
      isActive: true,
      startsAt: { lte: now },
      employeeTasks: { none: { employeeId } },
      AND: [scopeMatches(employee), { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Задачи, которые сотрудник уже взял (в работе или завершённые), с данными шаблона. */
export function listEmployeeTasks(employeeId: string) {
  return db.employeeTask.findMany({
    where: { employeeId },
    include: { task: true },
    orderBy: { joinedAt: "desc" },
  });
}

export async function joinTask(params: { employeeId: string; taskId: string; prizeCardId?: string | null }): Promise<void> {
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
    const card = await db.benefitCard.findUnique({ where: { id: params.prizeCardId }, select: { coinPrice: true } });
    if (!card?.coinPrice) throw new GamificationTaskError("Выбранный приз не продаётся за монеты.");
  }
  const existing = await db.employeeTask.findUnique({
    where: { employeeId_taskId: { employeeId: params.employeeId, taskId: params.taskId } },
  });
  if (existing) throw new GamificationTaskError("Вы уже взяли эту задачу.");

  await db.employeeTask.create({
    data: { employeeId: params.employeeId, taskId: params.taskId, prizeCardId: params.prizeCardId ?? null },
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
      return db.coupon.count({ where: { employeeId, status: "USED", updatedAt: { gte: since } } });
    case "FEEDBACK_GIVEN":
      return db.satisfactionResponse.count({ where: { employeeId, createdAt: { gte: since } } });
  }
}

/** Пересчёт прогресса всех AUTO-задач в работе. Вызывается cron-роутом раз в сутки. */
export async function recomputeAutoTasks(): Promise<{ checked: number; completed: number }> {
  const inProgress = await db.employeeTask.findMany({
    where: { status: "IN_PROGRESS", task: { is: { verification: "AUTO" } } },
    include: { task: true },
  });

  let completed = 0;
  for (const et of inProgress) {
    if (!et.task.autoMetric || et.task.targetValue == null) continue;
    const progressValue = await computeAutoProgress(et.task.autoMetric, et.employeeId, et.joinedAt);
    const reachedTarget = progressValue >= et.task.targetValue;
    if (!reachedTarget) {
      await db.employeeTask.update({ where: { id: et.id }, data: { progressValue } });
      continue;
    }
    // Атомарный claim по IN_PROGRESS — на случай перекрывающихся запусков
    // cron-роута (см. rewardCompletedTask: двойная покупка приза не idempotent).
    const claimed = await db.employeeTask.updateMany({
      where: { id: et.id, status: "IN_PROGRESS" },
      data: { progressValue, status: "COMPLETED", completedAt: new Date() },
    });
    if (claimed.count === 0) continue;
    completed += 1;
    await rewardCompletedTask(et.id);
    await audit({ actorId: null, action: "GAMIFICATION_TASK_COMPLETED", entityType: "EmployeeTask", entityId: et.id, newValue: { auto: true } });
  }
  return { checked: inProgress.length, completed };
}
