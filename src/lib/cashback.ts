import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { calcCashback, MAX_PURCHASE_DIRAM, formatSomoni } from "@/lib/cashback-math";
import { isCouponOverdue } from "@/lib/coupon";

export type CashbackState = {
  /** Накопленный баланс сотрудника у партнёра, дирамы. */
  balance: number;
  /** % кешбека действующей льготы (0, если начисление сейчас невозможно). */
  percent: number;
  /** Начисление возможно: есть действующий купон-кешбек этого партнёра. */
  canAccrue: boolean;
  /** Название льготы для кассы (если есть действующий купон). */
  cardTitle: string | null;
};

/**
 * Состояние кешбека сотрудника у партнёра. Начисление разрешено, только пока действует
 * купон карточки в режиме CASHBACK (выдан, не просрочен, период начался); списывать
 * накопленное можно всегда — даже когда купона уже нет.
 */
export async function getCashbackState(employeeId: string, partnerId: string): Promise<CashbackState> {
  const now = new Date();
  const [account, coupons] = await Promise.all([
    db.cashbackAccount.findUnique({ where: { employeeId_partnerId: { employeeId, partnerId } } }),
    db.coupon.findMany({
      where: { employeeId, partnerId, status: "ISSUED", item: { card: { mode: "CASHBACK" } } },
      include: { item: { include: { card: true } }, period: true },
      orderBy: { issuedAt: "desc" },
    }),
  ]);
  const active = coupons.find((c) => !isCouponOverdue(c, now) && now >= c.period.startDate);
  const percent = active?.item.card.cashbackPercent ?? 0;
  return {
    balance: account?.balance ?? 0,
    percent,
    canAccrue: !!active && percent > 0,
    cardTitle: active?.item.card.title ?? null,
  };
}

export type ApplyCashbackInput = {
  employeeId: string;
  partnerId: string;
  /** Сумма покупки по чеку, дирамы. */
  purchase: number;
  useBalance: boolean;
  /** Уникальный ключ операции (генерируется в кассе) — защита от двойного нажатия. */
  opKey: string;
  actorId: string;
};

export type ApplyCashbackResult = { redeem: number; paid: number; accrue: number; newBalance: number };

/**
 * Проводит покупку: списывает кешбек (если просили), затем начисляет % от реально
 * оплаченной суммы. Всё в одной транзакции; баланс уменьшается условным
 * обновлением, так что параллельные операции не уведут его в минус.
 * Повтор с тем же `opKey` возвращает результат первой операции, ничего не меняя.
 */
export async function applyCashback(input: ApplyCashbackInput): Promise<ApplyCashbackResult> {
  const { employeeId, partnerId, purchase, useBalance, opKey, actorId } = input;
  if (!Number.isSafeInteger(purchase) || purchase <= 0 || purchase > MAX_PURCHASE_DIRAM) {
    throw new Error("Введите корректную сумму покупки.");
  }
  if (!/^[\w-]{8,64}$/.test(opKey)) throw new Error("Некорректный ключ операции.");

  const state = await getCashbackState(employeeId, partnerId);
  const calc = calcCashback({
    purchase,
    balance: state.balance,
    percent: state.percent,
    canAccrue: state.canAccrue,
    useBalance,
  });
  if (calc.redeem === 0 && calc.accrue === 0) {
    throw new Error(
      state.canAccrue || state.balance > 0
        ? "Нечего проводить: кешбек не списывается и не начисляется."
        : "У сотрудника нет действующей льготы-кешбека у этого партнёра.",
    );
  }

  const done = await db.cashbackEntry.findFirst({
    where: { opKey: { in: [`${opKey}:R`, `${opKey}:A`] } },
    select: { id: true },
  });
  if (done) return calc; // повторное нажатие — операция уже проведена

  const couponId = state.canAccrue
    ? (
        await db.coupon.findFirst({
          where: { employeeId, partnerId, status: "ISSUED", item: { card: { mode: "CASHBACK" } } },
          orderBy: { issuedAt: "desc" },
          select: { id: true },
        })
      )?.id ?? null
    : null;

  await db.$transaction(async (tx) => {
    const account = await tx.cashbackAccount.upsert({
      where: { employeeId_partnerId: { employeeId, partnerId } },
      create: { employeeId, partnerId },
      update: {},
    });
    if (calc.redeem > 0) {
      const r = await tx.cashbackAccount.updateMany({
        where: { id: account.id, balance: { gte: calc.redeem } },
        data: { balance: { decrement: calc.redeem } },
      });
      if (r.count === 0) throw new Error("Недостаточно кешбека на балансе — обновите данные сотрудника.");
      await tx.cashbackEntry.create({
        data: {
          accountId: account.id,
          kind: "REDEMPTION",
          amount: calc.redeem,
          purchaseAmount: purchase,
          paidAmount: calc.paid,
          couponId,
          actorId,
          opKey: `${opKey}:R`,
        },
      });
    }
    if (calc.accrue > 0) {
      await tx.cashbackAccount.update({
        where: { id: account.id },
        data: { balance: { increment: calc.accrue } },
      });
      await tx.cashbackEntry.create({
        data: {
          accountId: account.id,
          kind: "ACCRUAL",
          amount: calc.accrue,
          purchaseAmount: purchase,
          paidAmount: calc.paid,
          couponId,
          actorId,
          opKey: `${opKey}:A`,
        },
      });
    }
  });

  await audit({
    actorId,
    action: "CASHBACK_APPLIED",
    entityType: "Employee",
    entityId: employeeId,
    newValue: {
      partnerId,
      purchase: formatSomoni(purchase),
      redeemed: formatSomoni(calc.redeem),
      paid: formatSomoni(calc.paid),
      accrued: formatSomoni(calc.accrue),
    },
  });
  return calc;
}

/** Балансы кешбека сотрудника по партнёрам + последние операции — для страницы сотрудника. */
export async function getEmployeeCashback(employeeId: string) {
  const accounts = await db.cashbackAccount.findMany({
    where: { employeeId },
    include: {
      partner: { select: { name: true } },
      entries: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { updatedAt: "desc" },
  });
  return accounts;
}
