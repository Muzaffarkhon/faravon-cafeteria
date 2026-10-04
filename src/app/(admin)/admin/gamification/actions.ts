"use server";

import { revalidatePath } from "next/cache";
import type { GamificationAutoMetric, GamificationVerification, TaskScope } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";
import { completeEmployeeTaskManual, GamificationTaskError } from "@/lib/gamification-tasks";
import { decideCoinRedemption, CoinRedemptionError } from "@/lib/coin-redemption";
import { setGamificationEnabled, setDailyBonusCoins, setWheelSettings } from "@/lib/gamification-settings";
import { prizeCardProblem, WHEEL_MAX_SECTORS } from "@/lib/wheel";

export type TaskFormState = { error?: string };
export type ToggleFormState = { ok?: boolean; error?: string };

/** Рубильник геймификации — вкл/выкл всей фичи без релиза кода. */
export async function saveGamificationEnabled(_prev: ToggleFormState, formData: FormData): Promise<ToggleFormState> {
  const s = await requireSession();
  assertCan(s.roles, "gamification.manage");
  const enabled = formData.get("enabled") === "on";
  const dailyBonusCoins = Number.parseInt(String(formData.get("dailyBonusCoins") ?? ""), 10);
  if (!Number.isSafeInteger(dailyBonusCoins) || dailyBonusCoins < 0) {
    return { error: "Монет за визит должно быть целым числом ≥ 0." };
  }
  await Promise.all([
    setGamificationEnabled(s.user.id, enabled),
    setDailyBonusCoins(s.user.id, dailyBonusCoins),
  ]);
  revalidatePath("/admin/gamification");
  return { ok: true };
}

export async function saveWheelSettings(_prev: ToggleFormState, formData: FormData): Promise<ToggleFormState> {
  const s = await requireSession();
  assertCan(s.roles, "gamification.manage");
  const wheelSpinCost = Number.parseInt(String(formData.get("wheelSpinCost") ?? ""), 10);
  if (!Number.isSafeInteger(wheelSpinCost) || wheelSpinCost < 0 || wheelSpinCost > 100_000) {
    return { error: "Цена прокрутки — целое число от 0 до 100 000 (0 — бесплатно)." };
  }
  const wheelDailyLimit = Number.parseInt(String(formData.get("wheelDailyLimit") ?? "1"), 10);
  if (!Number.isSafeInteger(wheelDailyLimit) || wheelDailyLimit < 1 || wheelDailyLimit > 100) {
    return { error: "Лимит прокруток в день — целое число от 1 до 100." };
  }
  const wheelSpinsForRating = Number.parseInt(String(formData.get("wheelSpinsForRating") ?? "0"), 10);
  if (!Number.isSafeInteger(wheelSpinsForRating) || wheelSpinsForRating < 0 || wheelSpinsForRating > 10) {
    return { error: "Прокруток за оценку — целое число от 0 до 10." };
  }
  await setWheelSettings(s.user.id, {
    wheelEnabled: formData.get("wheelEnabled") === "on",
    wheelSpinCost,
    wheelDailyLimit,
    wheelSpinsForRating,
  });
  revalidatePath("/admin/gamification");
  revalidatePath("/gamification");
  return { ok: true };
}

const intField = (formData: FormData, name: string) => Number.parseInt(String(formData.get(name) ?? ""), 10);

/** Создание (sectorId = null) или правка листка колеса. */
export async function saveWheelSector(sectorId: string | null, _prev: ToggleFormState, formData: FormData): Promise<ToggleFormState> {
  const s = await requireSession();
  assertCan(s.roles, "gamification.manage");

  const kind = String(formData.get("kind") ?? "");
  if (kind !== "COUPON" && kind !== "COINS" && kind !== "NOTHING") return { error: "Выберите, что лежит в листке." };
  const position = intField(formData, "position");
  if (!Number.isSafeInteger(position) || position < 1 || position > 999) return { error: "Место на колесе — целое число от 1." };
  const weight = intField(formData, "weight");
  if (!Number.isSafeInteger(weight) || weight < 0 || weight > 1_000_000) return { error: "Вес шанса — целое число от 0 (0 — листок никогда не выпадает)." };
  const label = String(formData.get("label") ?? "").trim().slice(0, 40) || null;

  const existing = sectorId ? await db.wheelSector.findUnique({ where: { id: sectorId } }) : null;
  if (sectorId && !existing) return { error: "Листок не найден — обновите страницу." };

  let coins: number | null = null;
  let cardId: string | null = null;
  let quantity: number | null = null;
  if (kind === "COINS") {
    coins = intField(formData, "coins");
    if (!Number.isSafeInteger(coins) || coins < 1 || coins > 100_000) return { error: "Количество монет — целое число от 1." };
  }
  if (kind === "COUPON") {
    cardId = String(formData.get("cardId") ?? "") || null;
    const card = cardId
      ? await db.benefitCard.findUnique({ where: { id: cardId }, include: { partner: { select: { deliveryMode: true } } } })
      : null;
    if (!card) return { error: "Выберите льготу для купона." };
    const problem = prizeCardProblem(card);
    if (problem) return { error: `Эту льготу разыграть нельзя: ${problem}.` };
    quantity = intField(formData, "quantity");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) return { error: "Сколько человек могут выиграть — целое число от 1." };
    // Уже выигранное не отзываем: при той же льготе остаток нельзя увести ниже нуля.
    if (existing?.kind === "COUPON" && existing.cardId === cardId && quantity < existing.wonCount) {
      return { error: `Уже выиграно ${existing.wonCount} — количество не может быть меньше.` };
    }
  }

  const activeCount = await db.wheelSector.count({ where: { isActive: true, ...(sectorId ? { id: { not: sectorId } } : {}) } });
  if (activeCount >= WHEEL_MAX_SECTORS && (existing?.isActive ?? true)) {
    return { error: `На колесе помещается не больше ${WHEEL_MAX_SECTORS} листков.` };
  }

  // Смена приза в листке начинает розыгрыш заново — счётчик прежнего купона к новому не относится.
  const prizeChanged = !existing || existing.kind !== kind || existing.cardId !== cardId;
  const data = { kind, position, weight, label, coins, cardId, quantity, ...(prizeChanged ? { wonCount: 0 } : {}) } as const;
  const saved = existing
    ? await db.wheelSector.update({ where: { id: existing.id }, data })
    : await db.wheelSector.create({ data });
  await audit({
    actorId: s.user.id,
    action: existing ? "WHEEL_SECTOR_UPDATED" : "WHEEL_SECTOR_CREATED",
    entityType: "WheelSector",
    entityId: saved.id,
    oldValue: existing ?? undefined,
    newValue: data,
  });
  revalidatePath("/admin/gamification");
  revalidatePath("/gamification/wheel");
  return { ok: true };
}

export async function toggleWheelSector(sectorId: string, isActive: boolean, _prev: ActionResult, _formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "gamification.manage");
    if (isActive && (await db.wheelSector.count({ where: { isActive: true } })) >= WHEEL_MAX_SECTORS) {
      throw new Error(`На колесе помещается не больше ${WHEEL_MAX_SECTORS} листков.`);
    }
    await db.wheelSector.update({ where: { id: sectorId }, data: { isActive } });
    await audit({ actorId: s.user.id, action: isActive ? "WHEEL_SECTOR_ACTIVATED" : "WHEEL_SECTOR_DEACTIVATED", entityType: "WheelSector", entityId: sectorId });
    revalidatePath("/admin/gamification");
    revalidatePath("/gamification/wheel");
  });
}

export async function deleteWheelSector(sectorId: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "gamification.manage");
    // Прокрутки хранят снимок приза, связь с листком обнуляется (onDelete: SetNull).
    await db.wheelSector.delete({ where: { id: sectorId } });
    await audit({ actorId: s.user.id, action: "WHEEL_SECTOR_DELETED", entityType: "WheelSector", entityId: sectorId });
    revalidatePath("/admin/gamification");
    revalidatePath("/gamification/wheel");
  });
}

const VERIFICATIONS: GamificationVerification[] = ["MANUAL", "AUTO"];
const METRICS: GamificationAutoMetric[] = ["APPLICATIONS_SUBMITTED", "COUPONS_USED", "FEEDBACK_GIVEN"];
const SCOPES: TaskScope[] = ["ALL", "DEPARTMENT", "SPECIFIC"];

export async function createGamificationTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const s = await requireSession();
  assertCan(s.roles, "gamification.manage");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title || !description) return { error: "Укажите название и описание задачи." };

  const coinReward = Number.parseInt(String(formData.get("coinReward") ?? ""), 10);
  if (!Number.isSafeInteger(coinReward) || coinReward <= 0) return { error: "Награда в монетах должна быть положительным целым числом." };

  const verificationRaw = String(formData.get("verification") ?? "MANUAL");
  if (!VERIFICATIONS.includes(verificationRaw as GamificationVerification)) return { error: "Некорректный тип проверки." };
  const verification = verificationRaw as GamificationVerification;

  let autoMetric: GamificationAutoMetric | null = null;
  let targetValue: number | null = null;
  if (verification === "AUTO") {
    const metricRaw = String(formData.get("autoMetric") ?? "");
    if (!METRICS.includes(metricRaw as GamificationAutoMetric)) return { error: "Выберите метрику для авто-проверки." };
    autoMetric = metricRaw as GamificationAutoMetric;
    targetValue = Number.parseInt(String(formData.get("targetValue") ?? ""), 10);
    if (!Number.isSafeInteger(targetValue) || targetValue <= 0) return { error: "Укажите порог (целое число больше 0)." };
  }

  const scopeRaw = String(formData.get("scope") ?? "ALL");
  if (!SCOPES.includes(scopeRaw as TaskScope)) return { error: "Некорректная область действия." };
  const scope = scopeRaw as TaskScope;
  const department = scope === "DEPARTMENT" ? String(formData.get("department") ?? "").trim() || null : null;
  if (scope === "DEPARTMENT" && !department) return { error: "Укажите подразделение." };

  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  const endsAt = endsAtRaw ? new Date(`${endsAtRaw}T23:59:59.999+05:00`) : null;

  const task = await db.gamificationTask.create({
    data: {
      title,
      description,
      coinReward,
      verification,
      autoMetric,
      targetValue,
      scope,
      department,
      endsAt,
      createdById: s.user.id,
    },
  });
  await audit({ actorId: s.user.id, action: "GAMIFICATION_TASK_CREATED", entityType: "GamificationTask", entityId: task.id, newValue: { title } });
  revalidatePath("/admin/gamification");
  return {};
}

export async function toggleTaskActive(taskId: string, isActive: boolean, _prev: ActionResult, _formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "gamification.manage");
    await db.gamificationTask.update({ where: { id: taskId }, data: { isActive } });
    await audit({ actorId: s.user.id, action: isActive ? "GAMIFICATION_TASK_ACTIVATED" : "GAMIFICATION_TASK_DEACTIVATED", entityType: "GamificationTask", entityId: taskId });
    revalidatePath("/admin/gamification");
  });
}

export async function completeTaskManually(employeeTaskId: string, _prev: ActionResult, _formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "gamification.manage");
    try {
      await completeEmployeeTaskManual({ employeeTaskId, actorId: s.user.id });
    } catch (e) {
      if (e instanceof GamificationTaskError) throw new Error(e.message);
      throw e;
    }
    revalidatePath("/admin/gamification");
  });
}

export async function decideRedemption(redemptionId: string, decision: "APPROVE" | "REJECT", _prev: ActionResult, _formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "gamification.manage");
    try {
      await decideCoinRedemption({ redemptionId, decision, actorId: s.user.id });
    } catch (e) {
      if (e instanceof CoinRedemptionError) throw new Error(e.message);
      throw e;
    }
    revalidatePath("/admin/gamification");
  });
}
