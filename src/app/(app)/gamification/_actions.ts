"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import { joinTask, cancelTask, GamificationTaskError } from "@/lib/gamification-tasks";
import { redeemWithCoins, CoinRedemptionError } from "@/lib/coin-redemption";
import { claimDailyBonus, DailyBonusError } from "@/lib/daily-bonus";
import { spinWheel, WheelError, type SpinResult } from "@/lib/wheel";

/** Не form-action: клиенту нужен сам результат, чтобы докрутить колесо до выпавшего листка. */
export async function spinWheelAction(): Promise<{ error?: string; result?: SpinResult }> {
  const s = await requireSession();
  if (!s.employee) return { error: "Доступно только сотрудникам." };
  try {
    const result = await spinWheel(s.employee.id, s.user.id);
    return { result };
  } catch (e) {
    if (e instanceof WheelError) return { error: e.message };
    console.error("[wheel] spin failed", e);
    return { error: "Не удалось прокрутить колесо — попробуйте ещё раз." };
  }
}

export async function joinTaskAction(taskId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    if (!s.employee) throw new Error("Доступно только сотрудникам.");
    const prizeCardId = String(formData.get("prizeCardId") ?? "").trim() || null;
    try {
      await joinTask({ employeeId: s.employee.id, taskId, prizeCardId });
    } catch (e) {
      if (e instanceof GamificationTaskError) throw new Error(e.message);
      throw e;
    }
    revalidatePath("/gamification");
  });
}

export async function cancelTaskAction(employeeTaskId: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    if (!s.employee) throw new Error("Доступно только сотрудникам.");
    try {
      await cancelTask({ employeeId: s.employee.id, employeeTaskId });
    } catch (e) {
      if (e instanceof GamificationTaskError) throw new Error(e.message);
      throw e;
    }
    revalidatePath("/gamification");
  });
}

export async function claimDailyBonusAction(_prev: ActionResult, _formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    if (!s.employee) throw new Error("Доступно только сотрудникам.");
    try {
      await claimDailyBonus(s.employee.id);
    } catch (e) {
      if (e instanceof DailyBonusError) throw new Error(e.message);
      throw e;
    }
    revalidatePath("/gamification");
  });
}

export async function buyWithCoinsAction(benefitCardId: string, _prev: ActionResult, _formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    if (!s.employee) throw new Error("Доступно только сотрудникам.");
    try {
      await redeemWithCoins({ employeeId: s.employee.id, benefitCardId, actorId: s.user.id });
    } catch (e) {
      if (e instanceof CoinRedemptionError) throw new Error(e.message);
      throw e;
    }
    revalidatePath("/gamification");
  });
}
