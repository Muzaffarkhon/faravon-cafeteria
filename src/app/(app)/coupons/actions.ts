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
  const issued = await issueCouponIfReady(coupon.id, s.user.id);
  // issueCouponIfReady шлёт COUPON_ISSUED с deferFlush — доставляем сейчас,
  // иначе сообщение «купон готов» ждёт cron.
  flushTelegram();

  revalidateAll();

  if (!issued) {
    const item = await db.applicationItem.findUnique({
      where: { id: itemId },
      select: {
        cardId: true,
        card: { select: { minParticipants: true } },
        application: { select: { periodId: true } },
      },
    });
    if (item && item.card.minParticipants > 1) {
      const have = await groupApprovedCount(item.cardId, item.application.periodId);
      return {
        notice: `Купон сформирован, но пока не выдан: групповая льгота, одобрено ${have} из ${item.card.minParticipants} участников. Он уйдёт сотруднику автоматически, когда одобрят всю группу.`,
      };
    }
  }
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

  // Атомарный переход CREATED → ISSUED + позиция — в одной транзакции
  // (защита от гонки «двойной клик» и от рассинхрона купон/позиция).
  const claimedOk = await db.$transaction(async (tx) => {
    const claimed = await tx.coupon.updateMany({
      where: { id: couponId, status: "CREATED" },
      data: { status: "ISSUED", issuedAt: new Date() },
    });
    if (claimed.count === 0) return false;
    await tx.applicationItem.update({
      where: { id: coupon.itemId },
      data: { status: "COUPON_ISSUED" },
    });
    return true;
  });
  if (!claimedOk) throw new Error("Купон уже выдан.");

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

/** Удалить купон (C_AND_B). Связанная позиция возвращается в статус «Одобрено». */
export async function deleteCoupon(couponId: string): Promise<ActionResult> {
  return runAction(() => deleteCouponImpl(couponId));
}

async function deleteCouponImpl(couponId: string) {
  const s = await requireSession();
  assertCan(s.roles, "coupons.manage");

  const coupon = await db.coupon.findUnique({
    where: { id: couponId },
    include: { item: { include: { card: true } } },
  });
  if (!coupon) throw new Error("Купон не найден.");

  await db.$transaction(async (tx) => {
    await tx.coupon.delete({ where: { id: couponId } });
    if (coupon.itemId) {
      await tx.applicationItem.update({
        where: { id: coupon.itemId },
        data: { status: "APPROVED" },
      });
    }
  });

  await audit({
    actorId: s.user.id,
    action: "COUPON_DELETED",
    entityType: "Coupon",
    entityId: couponId,
    oldValue: {
      number: coupon.number,
      status: coupon.status,
      employeeId: coupon.employeeId,
      card: coupon.item?.card?.title,
    },
  });

  revalidateAll();
}
