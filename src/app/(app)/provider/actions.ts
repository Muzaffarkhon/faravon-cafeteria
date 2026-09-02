"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import {
  COUPON_STATUS_LABELS,
  isCouponExpired,
  lookupCouponByNumber,
  redeemCouponByNumber,
} from "@/lib/coupon";

export type CouponView = {
  number: string;
  status: string;
  statusLabel: string;
  employee: string;
  card: string;
  partner: string | null;
  period: string;
  validUntil: string | null;
  expired: boolean;
  redeemable: boolean;
};

export type LookupResult = { coupon?: CouponView; error?: string };
export type RedeemResult = { ok?: boolean; error?: string };

export async function lookupCoupon(number: string): Promise<LookupResult> {
  const s = await requireSession();
  assertCan(s.roles, "coupons.confirm");

  const n = number.trim();
  if (!n) return { error: "Введите номер купона." };

  const c = await lookupCouponByNumber(n);
  if (!c) return { error: "Купон с таким номером не найден." };

  const expired = isCouponExpired(c.validUntil);

  return {
    coupon: {
      number: c.number,
      status: c.status,
      statusLabel: expired && c.status === "ISSUED" ? "Просрочен" : COUPON_STATUS_LABELS[c.status],
      employee: c.employee.fullName,
      card: c.item.card.title,
      partner: c.partner?.name ?? c.item.card.partner?.name ?? null,
      period: c.period.name,
      validUntil: c.validUntil ? c.validUntil.toLocaleDateString("ru-RU") : null,
      expired,
      redeemable: c.status === "ISSUED" && !expired,
    },
  };
}

export async function redeemCoupon(number: string): Promise<RedeemResult> {
  const s = await requireSession();
  assertCan(s.roles, "coupons.confirm");
  try {
    await redeemCouponByNumber(number, s.user.id);
    revalidatePath("/provider");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось погасить купон." };
  }
}
