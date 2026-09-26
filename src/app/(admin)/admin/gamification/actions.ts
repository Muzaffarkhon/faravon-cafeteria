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
import { setGamificationEnabled } from "@/lib/gamification-settings";

export type TaskFormState = { error?: string };
export type ToggleFormState = { ok?: boolean; error?: string };

/** Рубильник геймификации — вкл/выкл всей фичи без релиза кода. */
export async function saveGamificationEnabled(_prev: ToggleFormState, formData: FormData): Promise<ToggleFormState> {
  const s = await requireSession();
  assertCan(s.roles, "gamification.manage");
  const enabled = formData.get("enabled") === "on";
  await setGamificationEnabled(s.user.id, enabled);
  revalidatePath("/admin/gamification");
  return { ok: true };
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
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;

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
