"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { assertTransition } from "@/lib/application-workflow";
import { audit } from "@/lib/audit";
import { notifyEmployee, flushTelegram } from "@/lib/notify";
import { groupApprovedCount } from "@/lib/selection";
import { formCouponForItem, issueCouponIfReady } from "@/lib/coupon-flow";
import { runAction, type ActionResult } from "@/lib/action-result";

function revalidateAll() {
  revalidatePath("/coupons");
  revalidatePath("/");
  revalidatePath("/applications");
}

/** Сформировать купон по одобренной позиции (ТЗ v2 §5.8). */
export async function createCoupon(itemId: string): Promise<ActionResult> {
  return runAction(() => createCouponImpl(itemId));
}

async function createCouponImpl(itemId: string) {
  const s = await requireSession();
  assertCan(s.roles, "coupons.manage");

  const existing = await db.applicationItem.findUnique({
    where: { id: itemId },
    select: { coupon: { select: { id: true } } },
  });
  if (existing?.coupon) throw new Error("Купон уже сформирован.");

  // Формируем и, если готово (не групповая или группа набрана), сразу выдаём.
  const coupon = await formCouponForItem(itemId, s.user.id);
  await issueCouponIfReady(coupon.id, s.user.id);
  // issueCouponIfReady шлёт COUPON_ISSUED с deferFlush — доставляем сейчас,
  // иначе сообщение «купон готов» ждёт cron.
  flushTelegram();

  revalidateAll();
}

/** Выдать сформированный купон сотруднику. */
export async function issueCoupon(couponId: string): Promise<ActionResult> {
  return runAction(() => issueCouponImpl(couponId));
}

async function issueCouponImpl(couponId: string) {
  const s = await requireSession();
  assertCan(s.roles, "coupons.manage");

  const coupon = await db.coupon.findUnique({
    where: { id: couponId },
    include: { item: { include: { card: true } }, employee: true },
  });
  if (!coupon) throw new Error("Купон не найден.");
  if (coupon.status !== "CREATED") throw new Error("Купон уже выдан или недоступен для выдачи.");
  assertTransition(coupon.item.status, "COUPON_ISSUED", "C_AND_B");

  // Групповая льгота: выдать купон можно только после набора группы (§ minParticipants).
  const min = coupon.item.card.minParticipants;
  if (min > 1) {
    const have = await groupApprovedCount(coupon.item.cardId, coupon.periodId);
    if (have < min) {
      throw new Error(
        `Групповая льгота «${coupon.item.card.title}»: одобрено ${have} из ${min} участников. Купон можно выдать после того, как одобрят всю группу.`,
      );
    }
  }

  // Атомарный переход CREATED → ISSUED — защита от гонки (двойной клик).
  const claimed = await db.coupon.updateMany({
    where: { id: couponId, status: "CREATED" },
    data: { status: "ISSUED", issuedAt: new Date() },
  });
  if (claimed.count === 0) throw new Error("Купон уже выдан.");

  await db.applicationItem.update({
    where: { id: coupon.itemId },
    data: { status: "COUPON_ISSUED" },
  });

  await audit({
    actorId: s.user.id,
    action: "COUPON_ISSUED",
    entityType: "Coupon",
    entityId: couponId,
    newValue: { number: coupon.number },
  });
  await notifyEmployee({
    employeeId: coupon.employeeId,
    event: "COUPON_ISSUED",
    payload: { card: coupon.item.card.title, number: coupon.number },
  });

  revalidateAll();
}
