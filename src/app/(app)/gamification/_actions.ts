"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import { joinTask, GamificationTaskError } from "@/lib/gamification-tasks";
import { redeemWithCoins, CoinRedemptionError } from "@/lib/coin-redemption";

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
