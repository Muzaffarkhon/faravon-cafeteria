"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { assertTransition } from "@/lib/application-workflow";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";
import { generateCouponNumber } from "@/lib/coupon";
import { groupProgressOne } from "@/lib/selection";
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

  const item = await db.applicationItem.findUnique({
    where: { id: itemId },
    include: {
      coupon: true,
      card: { include: { partner: true } },
      application: { include: { period: true } },
    },
  });
  if (!item) throw new Error("Позиция не найдена.");
  if (item.coupon) throw new Error("Купон уже сформирован.");
  assertTransition(item.status, "COUPON_CREATED", "C_AND_B");

  const number = await generateCouponNumber(item.application.period.startDate);
  const validUntil = new Date(item.application.period.endDate);
  validUntil.setUTCDate(validUntil.getUTCDate() + 30);

  await db.$transaction([
    db.coupon.create({
      data: {
        number,
        itemId: item.id,
        partnerId: item.card.partnerId,
        employeeId: item.application.employeeId,
        periodId: item.application.periodId,
        type: "PROMO",
        nominal: item.card.condition,
        status: "CREATED",
        deliveryChannel: "PORTAL",
        validUntil,
      },
    }),
    db.applicationItem.update({ where: { id: item.id }, data: { status: "COUPON_CREATED" } }),
  ]);

  await audit({
    actorId: s.user.id,
    action: "COUPON_CREATED",
    entityType: "ApplicationItem",
    entityId: item.id,
    newValue: { number },
  });
  await notifyEmployee({
    employeeId: item.application.employeeId,
    event: "COUPON_CREATED",
    payload: { card: item.card.title, number },
  });

  // If partner exists and has webhook/contact, optionally notify provider here (out of scope)

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
    const have = await groupProgressOne(coupon.item.cardId, coupon.periodId);
    if (have < min) {
      throw new Error(
        `Групповая льгота «${coupon.item.card.title}»: выбрали ${have} из ${min} сотрудников. Купон можно выдать после набора группы.`,
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
    payload: { number: coupon.number },
  });

  revalidateAll();
}
