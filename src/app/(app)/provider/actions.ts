"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import {
  COUPON_STATUS_LABELS,
  isCouponOverdue,
  lookupCouponByEmployeePhone,
  lookupCouponByNumber,
  redeemCouponByNumber,
} from "@/lib/coupon";

export type CouponView = {
  number: string;
  status: string;
  statusLabel: string;
  employee: string;
  department: string;
  card: string;
  condition: string | null;
  partner: string | null;
  period: string;
  validUntil: string | null;
  expired: boolean;
  redeemable: boolean;
  wrongPartner: boolean;
};

export type LookupResult = { coupon?: CouponView; error?: string };
export type RedeemResult = { ok?: boolean; error?: string };
export type PhoneLookupResult =
  | { status: "found"; coupon: CouponView }
  | { status: "not_found" }
  | { status: "no_benefit"; employee: string };

function toCouponView(
  c: NonNullable<Awaited<ReturnType<typeof lookupCouponByNumber>>>,
  actorPartnerId?: string | null,
): CouponView {
  const expired = isCouponOverdue(c);
  const wrongPartner = !!actorPartnerId && c.partnerId !== actorPartnerId;
  return {
    number: c.number,
    status: c.status,
    statusLabel: expired && c.status === "ISSUED" ? "Просрочен" : COUPON_STATUS_LABELS[c.status],
    employee: c.employee.fullName,
    department: c.employee.department,
    card: c.item.card.title,
    condition: c.item.card.condition,
    partner: c.partner?.name ?? c.item.card.partner?.name ?? null,
    period: c.period.name,
    validUntil: c.validUntil ? c.validUntil.toLocaleDateString("ru-RU") : null,
    expired,
    redeemable: c.status === "ISSUED" && !expired && !wrongPartner,
    wrongPartner,
  };
}

export async function lookupCoupon(number: string): Promise<LookupResult> {
  const s = await requireSession();
  assertCan(s.roles, "coupons.confirm");

  const n = number.trim();
  if (!n) return { error: "Введите номер купона." };

  const c = await lookupCouponByNumber(n);
  if (!c) return { error: "Купон с таким номером не найден." };

  return { coupon: toCouponView(c, s.user.partnerId) };
}

/** Поиск по телефону — касса партнёра (§8): работает, даже если сотрудник не знает про купон. */
export async function lookupCouponByPhone(phone: string): Promise<PhoneLookupResult> {
  const s = await requireSession();
  assertCan(s.roles, "coupons.confirm");

  const { employee, coupon } = await lookupCouponByEmployeePhone(phone, s.user.partnerId);
  if (!employee) return { status: "not_found" };
  if (!coupon) return { status: "no_benefit", employee: employee.fullName };
  return { status: "found", coupon: toCouponView(coupon, s.user.partnerId) };
}

export async function redeemCoupon(number: string): Promise<RedeemResult> {
  const s = await requireSession();
  assertCan(s.roles, "coupons.confirm");
  try {
    await redeemCouponByNumber(number, s.user.id, s.user.partnerId);
    revalidatePath("/provider");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось активировать купон." };
  }
}
