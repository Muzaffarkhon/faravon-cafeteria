"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";
import { isSandbox } from "@/lib/app-env";

/**
 * Очистка результатов тестового прогона: заявки, позиции, купоны, кешбек и
 * их уведомления. Справочники (льготы, партнёры, периоды, сотрудники) остаются
 * — чтобы прогнать сценарий заново, не настраивая всё с нуля.
 *
 * Работает ТОЛЬКО в песочнице: на боевом деплое нет `SANDBOX_LABEL`, и действие
 * обрывается до единого запроса к БД. Это главная защита — не права роли, а
 * сама среда: на проде выполнить нечем.
 */
export async function resetSandboxData(): Promise<ActionResult> {
  return runAction(async () => {
    if (!isSandbox()) {
      throw new Error("Очистка доступна только в тестовой среде.");
    }
    const s = await requireSession();
    assertCan(s.roles, "periods.manage");

    // Порядок важен: сначала то, что ссылается на другое.
    const cashbackEntries = await db.cashbackEntry.deleteMany({});
    const cashbackAccounts = await db.cashbackAccount.deleteMany({});
    const coupons = await db.coupon.deleteMany({});
    const items = await db.applicationItem.deleteMany({});
    const applications = await db.application.deleteMany({});
    await db.notification.deleteMany({
      where: {
        event: {
          in: [
            "APPLICATION_SUBMITTED",
            "ITEM_APPROVED",
            "ITEM_REJECTED",
            "COUPON_ISSUED",
            "COUPON_CONFIRMED_BY_PROVIDER",
            "SLA_ESCALATION",
          ],
        },
      },
    });

    await audit({
      actorId: s.user.id,
      action: "FLOW_RESET_BY_ADMIN",
      entityType: "System",
      newValue: {
        applications: applications.count,
        items: items.count,
        coupons: coupons.count,
        cashbackAccounts: cashbackAccounts.count,
        cashbackEntries: cashbackEntries.count,
      },
    });

    revalidatePath("/admin/sandbox");
    revalidatePath("/admin");
    revalidatePath("/");
  });
}
