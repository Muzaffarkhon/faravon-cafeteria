"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { broadcastTaxiPromo } from "@/lib/taxi";

export type TaxiPromoState = { sent?: number; error?: string };

/** Подрядчик такси вводит промокод — рассылка одобренным сотрудникам (§11). */
export async function sendTaxiPromo(
  _prev: TaxiPromoState,
  formData: FormData,
): Promise<TaxiPromoState> {
  const session = await requireSession();
  assertCan(session.roles, "promo.broadcast");
  const partnerId = session.user.partnerId;
  if (!partnerId) return { error: "Учётная запись не привязана к партнёру." };

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { deliveryMode: true },
  });
  if (partner?.deliveryMode !== "PHONE_PROMO") {
    return { error: "Рассылка промокодов доступна только партнёрам с режимом «по номеру телефона»." };
  }

  const promo = String(formData.get("promo") ?? "").trim();
  try {
    const sent = await broadcastTaxiPromo(partnerId, session.user.id, promo);
    revalidatePath("/provider/taxi");
    return { sent };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось отправить рассылку." };
  }
}
