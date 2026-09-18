"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import {
  couponStatusLabel,
  isCouponOverdue,
  lookupCouponByEmployeePhone,
  lookupCouponByNumber,
  redeemCouponByNumber,
} from "@/lib/coupon";
import { db } from "@/lib/db";
import { applyCashback, getCashbackState } from "@/lib/cashback";

/** Данные кассы для льготы-кешбека: баланс сотрудника у партнёра и правила начисления. */
export type CashbackView = {
  employeeId: string;
  partnerId: string;
  employee: string;
  department: string;
  partner: string | null;
  cardTitle: string | null;
  /** Дирамы. */
  balance: number;
  percent: number;
  canAccrue: boolean;
};

export type CouponView = {
  mode: "ONE_TIME" | "PERIOD" | "CASHBACK";
  /** Только для mode === "CASHBACK". */
  cashback: CashbackView | null;
  number: string;
  status: string;
  statusLabel: string;
  employee: string;
  department: string;
  card: string;
  condition: string | null;
  partner: string | null;
  period: string;
  validFrom: string | null;
  validUntil: string | null;
  expired: boolean;
  notYetValid: boolean;
  redeemable: boolean;
  wrongPartner: boolean;
};

export type LookupResult = { coupon?: CouponView; error?: string };
export type RedeemResult = { ok?: boolean; error?: string };
export type PhoneLookupResult =
  | { status: "found"; coupon: CouponView }
  /** Купона уже нет (период закончился), но у сотрудника остался кешбек у этого партнёра — его можно потратить. */
  | { status: "cashback_only"; cashback: CashbackView }
  | { status: "not_found" }
  | { status: "no_benefit"; employee: string };

function toCouponView(
  c: NonNullable<Awaited<ReturnType<typeof lookupCouponByNumber>>>,
  locale: Locale,
  actorPartnerId?: string | null,
): CouponView {
  const expired = isCouponOverdue(c);
  // Купон мог быть одобрен и выдан ещё в окне выбора, до начала самого
  // периода — партнёр не должен успеть погасить его раньше срока
  // (см. ту же проверку в redeemCouponByNumber).
  const notYetValid = c.status === "ISSUED" && new Date() < c.period.startDate;
  const wrongPartner = !!actorPartnerId && c.partnerId !== actorPartnerId;
  return {
    mode: c.item.card.mode,
    cashback: null,
    number: c.number,
    status: c.status,
    statusLabel:
      notYetValid
        ? translate(locale, "provider.statusNotYetValid")
        : expired && c.status === "ISSUED"
          ? translate(locale, "provider.statusExpired")
          : couponStatusLabel(locale, c.status),
    employee: c.employee.fullName,
    department: c.employee.department,
    card: c.item.card.title,
    condition: c.item.card.condition,
    partner: c.partner?.name ?? c.item.card.partner?.name ?? null,
    period: c.period.name,
    validFrom: c.period.startDate.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" }),
    validUntil: c.validUntil ? c.validUntil.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" }) : null,
    expired,
    notYetValid,
    redeemable: c.status === "ISSUED" && !expired && !notYetValid && !wrongPartner,
    wrongPartner,
  };
}

/** Для льготы-кешбека дописывает баланс и правила начисления. */
async function withCashback(
  view: CouponView,
  c: NonNullable<Awaited<ReturnType<typeof lookupCouponByNumber>>>,
): Promise<CouponView> {
  if (view.mode !== "CASHBACK" || !c.partnerId) return view;
  const st = await getCashbackState(c.employeeId, c.partnerId);
  return {
    ...view,
    cashback: {
      employeeId: c.employeeId,
      partnerId: c.partnerId,
      employee: c.employee.fullName,
      department: c.employee.department,
      partner: view.partner,
      cardTitle: c.item.card.title,
      balance: st.balance,
      percent: st.percent,
      canAccrue: st.canAccrue,
    },
  };
}

export async function lookupCoupon(number: string): Promise<LookupResult> {
  const s = await requireSession();
  assertCan(s.roles, "coupons.confirm");
  const locale = await getLocale();
  const t = await getTranslator();

  const n = number.trim();
  if (!n) return { error: t("provider.errors.enterNumber") };

  const c = await lookupCouponByNumber(n);
  if (!c) return { error: t("provider.errors.notFound") };

  return { coupon: await withCashback(toCouponView(c, locale, s.user.partnerId), c) };
}

/** Поиск по телефону — касса партнёра (§8): работает, даже если сотрудник не знает про купон. */
export async function lookupCouponByPhone(phone: string): Promise<PhoneLookupResult> {
  const s = await requireSession();
  assertCan(s.roles, "coupons.confirm");
  const locale = await getLocale();

  const { employee, coupon } = await lookupCouponByEmployeePhone(phone, s.user.partnerId);
  if (!employee) return { status: "not_found" };
  if (!coupon) {
    // Купона нет, но накопленный кешбек у партнёра остаётся — его можно потратить.
    const partnerId = s.user.partnerId;
    if (partnerId) {
      const [account, partner] = await Promise.all([
        db.cashbackAccount.findUnique({ where: { employeeId_partnerId: { employeeId: employee.id, partnerId } } }),
        db.partner.findUnique({ where: { id: partnerId }, select: { name: true } }),
      ]);
      if (account && account.balance > 0) {
        return {
          status: "cashback_only",
          cashback: {
            employeeId: employee.id,
            partnerId,
            employee: employee.fullName,
            department: employee.department,
            partner: partner?.name ?? null,
            cardTitle: null,
            balance: account.balance,
            percent: 0,
            canAccrue: false,
          },
        };
      }
    }
    return { status: "no_benefit", employee: employee.fullName };
  }
  return { status: "found", coupon: await withCashback(toCouponView(coupon, locale, s.user.partnerId), coupon) };
}

export async function redeemCoupon(number: string): Promise<RedeemResult> {
  const s = await requireSession();
  assertCan(s.roles, "coupons.confirm");
  const t = await getTranslator();
  try {
    await redeemCouponByNumber(number, s.user.id, s.user.partnerId);
    revalidatePath("/provider");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : t("provider.errors.redeemFailed") };
  }
}

export type CashbackResult =
  | { ok: true; redeem: number; paid: number; accrue: number; newBalance: number }
  | { ok: false; error: string };

/** Кешбек: касса вводит сумму покупки → списание накопленного (если просили) и начисление от оплаченного. */
export async function submitCashback(input: {
  employeeId: string;
  partnerId: string;
  purchase: number;
  useBalance: boolean;
  opKey: string;
}): Promise<CashbackResult> {
  const s = await requireSession();
  assertCan(s.roles, "coupons.confirm");
  const t = await getTranslator();
  // Кассир партнёра работает только со своим партнёром.
  if (s.user.partnerId && s.user.partnerId !== input.partnerId) {
    return { ok: false, error: t("provider.errors.wrongPartnerCashback") };
  }
  try {
    const r = await applyCashback({ ...input, actorId: s.user.id });
    revalidatePath("/provider");
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("provider.errors.redeemFailed") };
  }
}
