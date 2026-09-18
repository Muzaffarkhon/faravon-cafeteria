"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { CashbackError, reverseCashbackOperation } from "@/lib/cashback";

/** Сторно операции по кешбеку (исправление ошибки кассира). Право — cashback.manage. */
export async function reverseOperationAction(formData: FormData): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "cashback.manage");
  const operationKey = String(formData.get("operationKey") ?? "");
  const reason = String(formData.get("reason") ?? "");
  let result = "ok=1";
  try {
    await reverseCashbackOperation({ operationKey, reason, actorId: s.user.id });
  } catch (e) {
    if (e instanceof CashbackError) result = `error=${encodeURIComponent(e.message)}`;
    else {
      console.error("[cashback] сторно не удалось:", e);
      result = `error=${encodeURIComponent("Не удалось выполнить сторно.")}`;
    }
  }
  revalidatePath("/admin/cashback");
  redirect(`/admin/cashback?${result}`);
}
