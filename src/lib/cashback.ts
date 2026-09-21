import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";
import { isCouponOverdue } from "@/lib/coupon";
import { dushanbeInstant } from "@/lib/selection";
import { matchCashbackCodeWindow } from "@/lib/cashback-code";
import type { OpClaims } from "@/lib/op-token";
import { calcCashback, MAX_OPERATIONS_PER_DAY, MAX_PURCHASE_DIRAM, formatSomoni } from "@/lib/cashback-math";

/** Ошибка, текст которой безопасно показывать кассиру. */
export class CashbackError extends Error {}

export type CashbackState = {
  /** Накопленный баланс сотрудника у партнёра, дирамы. */
  balance: number;
  /** % кешбека по снимку правил действующего купона (0, если начисление сейчас невозможно). */
  percent: number;
  /** Начисление возможно: есть действующий купон-кешбек этого партнёра. */
  canAccrue: boolean;
  /** Название льготы для кассы (если есть действующий купон). */
  cardTitle: string | null;
  couponId: string | null;
};

/**
 * Состояние кешбека сотрудника у партнёра. Начисление разрешено, только пока действует
 * купон в режиме CASHBACK (выдан, не просрочен, период начался); процент берётся из
 * СНИМКА в купоне (`Coupon.cashbackPercent`), а не из текущей карточки — правка карточки
 * не меняет условия уже выданных купонов. Списывать накопленное можно всегда.
 */
export async function getCashbackState(employeeId: string, partnerId: string): Promise<CashbackState> {
  const now = new Date();
  const [account, coupons] = await Promise.all([
    db.cashbackAccount.findUnique({ where: { employeeId_partnerId: { employeeId, partnerId } } }),
    db.coupon.findMany({
      where: { employeeId, partnerId, status: "ISSUED", benefitMode: "CASHBACK" },
      include: { item: { include: { card: true } }, period: true },
      orderBy: { issuedAt: "desc" },
    }),
  ]);
  const active = coupons.find((c) => !isCouponOverdue(c, now) && now >= c.period.startDate && (c.cashbackPercent ?? 0) > 0);
  return {
    balance: account?.balance ?? 0,
    percent: active?.cashbackPercent ?? 0,
    canAccrue: !!active,
    cardTitle: active?.item.card.title ?? null,
    couponId: active?.id ?? null,
  };
}

export type ApplyCashbackInput = {
  /** Проверенные данные токена операции (кто, у кого, для кого). */
  claims: OpClaims;
  /** Сумма покупки по чеку, дирамы. */
  purchase: number;
  useBalance: boolean;
  /** Код клиента из его кабинета (4 цифры). */
  code: string;
};

export type ApplyCashbackResult = {
  redeem: number;
  paid: number;
  accrue: number;
  newBalance: number;
  /** true — это повтор уже проведённой операции (ничего не изменено). */
  duplicate: boolean;
};

const CODE_FAIL_WINDOW_MS = 10 * 60 * 1000;
const MAX_CODE_FAILS = 5;

const hashParams = (employeeId: string, partnerId: string, purchase: number, useBalance: boolean) =>
  createHash("sha256").update(`${employeeId}|${partnerId}|${purchase}|${useBalance ? 1 : 0}`).digest("hex");

/** Результат ранее проведённой операции с этим ключом (или null). Чужие цифры под старым ключом — ошибка. */
async function existingOperation(operationKey: string, paramsHash: string): Promise<ApplyCashbackResult | null> {
  const entries = await db.cashbackEntry.findMany({
    where: { operationKey, kind: { in: ["ACCRUAL", "REDEMPTION"] } },
    include: { account: { select: { balance: true } } },
  });
  if (entries.length === 0) return null;
  if (entries.some((e) => e.paramsHash !== paramsHash)) {
    throw new CashbackError("Эта операция уже проведена с другими данными. Найдите клиента заново.");
  }
  const redeem = entries.find((e) => e.kind === "REDEMPTION")?.amount ?? 0;
  const accrue = entries.find((e) => e.kind === "ACCRUAL")?.amount ?? 0;
  return {
    redeem,
    accrue,
    paid: entries[0].paidAmount,
    newBalance: entries[0].account.balance,
    duplicate: true,
  };
}

/** Начало текущих суток по Душанбе. */
function dushanbeDayStart(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return dushanbeInstant(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

/**
 * Проводит покупку: списывает кешбек (если просили), затем начисляет % от реально
 * оплаченной суммы. Защиты:
 *  - код клиента (доказательство присутствия), одноразовый; перебор блокируется;
 *  - идемпотентность по ключу операции с проверкой параметров, повтор безопасен;
 *  - расчёт и запись в одной сериализуемой транзакции по свежему балансу;
 *  - баланс уменьшается условным обновлением (не уйдёт в минус даже при гонке);
 *  - лимит числа операций в сутки по паре «сотрудник + партнёр» и потолок суммы чека;
 *  - сотруднику уходит уведомление о каждой операции.
 */
export async function applyCashback(input: ApplyCashbackInput): Promise<ApplyCashbackResult> {
  const { claims, purchase, useBalance, code } = input;
  const { employeeId, partnerId, actorId, nonce: operationKey } = claims;
  if (!Number.isSafeInteger(purchase) || purchase <= 0 || purchase > MAX_PURCHASE_DIRAM) {
    throw new CashbackError(`Сумма покупки должна быть от 0,01 до ${formatSomoni(MAX_PURCHASE_DIRAM)} сом.`);
  }
  const paramsHash = hashParams(employeeId, partnerId, purchase, useBalance);

  // 1. Повтор (двойное нажатие, повторный запрос) — возвращаем результат первой операции.
  const dup = await existingOperation(operationKey, paramsHash);
  if (dup) return dup;

  // 2. Код клиента: защита от перебора, затем сверка.
  const fails = await db.auditLog.count({
    where: {
      action: "CASHBACK_CODE_FAILED",
      entityType: "Employee",
      entityId: employeeId,
      createdAt: { gte: new Date(Date.now() - CODE_FAIL_WINDOW_MS) },
    },
  });
  if (fails >= MAX_CODE_FAILS) {
    throw new CashbackError("Слишком много неверных кодов. Операции по этому сотруднику заблокированы на 10 минут.");
  }
  const window = matchCashbackCodeWindow(employeeId, code);
  if (window === null) {
    await audit({ actorId, action: "CASHBACK_CODE_FAILED", entityType: "Employee", entityId: employeeId, newValue: { partnerId } });
    throw new CashbackError("Неверный код клиента. Попросите показать актуальный код в приложении.");
  }

  // 3. Правила и лимиты.
  const state = await getCashbackState(employeeId, partnerId);
  if (!state.canAccrue && state.balance === 0) {
    throw new CashbackError("У сотрудника нет действующей льготы-кешбека у этого партнёра.");
  }
  const todayOps = await db.cashbackEntry.groupBy({
    by: ["operationKey"],
    where: {
      kind: { in: ["ACCRUAL", "REDEMPTION"] },
      account: { is: { employeeId, partnerId } },
      createdAt: { gte: dushanbeDayStart() },
    },
  });
  if (todayOps.length >= MAX_OPERATIONS_PER_DAY) {
    throw new CashbackError(`Достигнут дневной лимит операций (${MAX_OPERATIONS_PER_DAY}) по этому сотруднику.`);
  }

  // 4. Проведение: сверка баланса и запись — в одной сериализуемой транзакции.
  let calc: ReturnType<typeof calcCashback>;
  try {
    calc = await db.$transaction(
      async (tx) => {
        const account = await tx.cashbackAccount.upsert({
          where: { employeeId_partnerId: { employeeId, partnerId } },
          create: { employeeId, partnerId },
          update: {},
        });
        // Код одноразовый: окно должно быть новее последнего использованного.
        const used = await tx.cashbackAccount.updateMany({
          where: { id: account.id, OR: [{ lastCodeWindow: null }, { lastCodeWindow: { lt: window } }] },
          data: { lastCodeWindow: window },
        });
        if (used.count === 0) throw new CashbackError("Этот код уже использован. Попросите клиента показать новый.");

        const fresh = await tx.cashbackAccount.findUniqueOrThrow({ where: { id: account.id }, select: { balance: true } });
        const c = calcCashback({
          purchase,
          balance: fresh.balance,
          percent: state.percent,
          canAccrue: state.canAccrue,
          useBalance,
        });
        if (c.redeem === 0 && c.accrue === 0) {
          throw new CashbackError("Нечего проводить: кешбек не списывается и не начисляется.");
        }
        const base = { accountId: account.id, purchaseAmount: purchase, paidAmount: c.paid, couponId: state.couponId, actorId, operationKey, paramsHash };
        if (c.redeem > 0) {
          const r = await tx.cashbackAccount.updateMany({
            where: { id: account.id, balance: { gte: c.redeem } },
            data: { balance: { decrement: c.redeem } },
          });
          if (r.count === 0) throw new CashbackError("Недостаточно кешбека на балансе — найдите клиента заново.");
          await tx.cashbackEntry.create({ data: { ...base, kind: "REDEMPTION", amount: c.redeem, opKey: `${operationKey}:R` } });
        }
        if (c.accrue > 0) {
          await tx.cashbackAccount.update({ where: { id: account.id }, data: { balance: { increment: c.accrue } } });
          await tx.cashbackEntry.create({ data: { ...base, kind: "ACCRUAL", amount: c.accrue, opKey: `${operationKey}:A` } });
        }
        return c;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    // Параллельный дубль с тем же ключом: вернуть результат победителя.
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2002" || e.code === "P2034")) {
      const again = await existingOperation(operationKey, paramsHash);
      if (again) return again;
      if (e.code === "P2034") throw new CashbackError("Операция не прошла из-за одновременного изменения — повторите.");
    }
    throw e;
  }

  const partner = await db.partner.findUnique({ where: { id: partnerId }, select: { name: true } });
  await audit({
    actorId,
    action: "CASHBACK_APPLIED",
    entityType: "Employee",
    entityId: employeeId,
    newValue: {
      operationKey,
      partnerId,
      purchase: formatSomoni(purchase),
      redeemed: formatSomoni(calc.redeem),
      paid: formatSomoni(calc.paid),
      accrued: formatSomoni(calc.accrue),
    },
  });
  // Сотрудник узнаёт о каждой операции: так подмену или фиктивный чек заметят.
  await notifyEmployee({
    employeeId,
    event: "CASHBACK_OPERATION",
    payload: {
      partner: partner?.name ?? "",
      purchase: formatSomoni(purchase),
      redeemed: calc.redeem > 0 ? formatSomoni(calc.redeem) : "",
      accrued: calc.accrue > 0 ? formatSomoni(calc.accrue) : "",
      balance: formatSomoni(calc.newBalance),
    },
  });
  return { ...calc, duplicate: false };
}

/**
 * Сторно операции (исправление ошибки кассира): для каждой записи журнала пишется
 * запись-противовес, сами записи не меняются. Сначала гасится списание (баланс растёт),
 * затем начисление (баланс уменьшается, только если начисленное ещё не потрачено).
 * Сторнировать может только сотрудник C&B, не тот, кто проводил операцию.
 */
export async function reverseCashbackOperation(params: { operationKey: string; reason: string; actorId: string }) {
  const reason = params.reason.trim();
  if (reason.length < 5 || reason.length > 300) throw new CashbackError("Укажите причину сторно (5–300 символов).");

  const entries = await db.cashbackEntry.findMany({
    where: { operationKey: params.operationKey, kind: { in: ["ACCRUAL", "REDEMPTION"] } },
    include: { account: { select: { employeeId: true, partnerId: true } } },
  });
  if (entries.length === 0) throw new CashbackError("Операция не найдена.");
  if (entries.some((e) => e.actorId === params.actorId)) {
    throw new CashbackError("Сторно должен провести другой сотрудник, не тот, кто проводил операцию.");
  }
  const { employeeId, partnerId } = entries[0].account;
  const ordered = [...entries].sort((a, b) => (a.kind === "REDEMPTION" ? -1 : 1) - (b.kind === "REDEMPTION" ? -1 : 1));

  try {
    await db.$transaction(
      async (tx) => {
        for (const e of ordered) {
          if (await tx.cashbackEntry.findUnique({ where: { reversesEntryId: e.id }, select: { id: true } })) {
            throw new CashbackError("Операция уже сторнирована.");
          }
          if (e.kind === "REDEMPTION") {
            await tx.cashbackAccount.update({ where: { id: e.accountId }, data: { balance: { increment: e.amount } } });
          } else {
            const r = await tx.cashbackAccount.updateMany({
              where: { id: e.accountId, balance: { gte: e.amount } },
              data: { balance: { decrement: e.amount } },
            });
            if (r.count === 0) {
              throw new CashbackError("Начисленный кешбек уже потрачен — отменить начисление нельзя, пока не сторнированы связанные списания.");
            }
          }
          await tx.cashbackEntry.create({
            data: {
              accountId: e.accountId,
              kind: e.kind === "REDEMPTION" ? "REDEMPTION_REVERSAL" : "ACCRUAL_REVERSAL",
              amount: e.amount,
              purchaseAmount: e.purchaseAmount,
              paidAmount: e.paidAmount,
              couponId: e.couponId,
              actorId: params.actorId,
              opKey: `rev:${e.id}`,
              operationKey: `rev:${params.operationKey}`,
              reversesEntryId: e.id,
              reason,
            },
          });
        }
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new CashbackError("Операция уже сторнирована.");
    }
    throw e;
  }

  const [partner, account] = await Promise.all([
    db.partner.findUnique({ where: { id: partnerId }, select: { name: true } }),
    db.cashbackAccount.findUnique({ where: { employeeId_partnerId: { employeeId, partnerId } }, select: { balance: true } }),
  ]);
  await audit({
    actorId: params.actorId,
    action: "CASHBACK_REVERSED",
    entityType: "Employee",
    entityId: employeeId,
    newValue: { operationKey: params.operationKey, partnerId, reason },
  });
  await notifyEmployee({
    employeeId,
    event: "CASHBACK_REVERSED",
    payload: { partner: partner?.name ?? "", balance: formatSomoni(account?.balance ?? 0), reason },
  });
}

/** Балансы кешбека сотрудника по партнёрам + последние операции — для страницы сотрудника. */
export async function getEmployeeCashback(employeeId: string) {
  return db.cashbackAccount.findMany({
    where: { employeeId },
    include: {
      partner: { select: { name: true } },
      entries: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** Есть ли у сотрудника смысл показывать код для кассы (счёт или действующий купон-кешбек). */
export async function employeeHasCashback(employeeId: string): Promise<boolean> {
  const [accounts, coupons] = await Promise.all([
    db.cashbackAccount.count({ where: { employeeId } }),
    db.coupon.count({ where: { employeeId, benefitMode: "CASHBACK", status: { in: ["CREATED", "ISSUED"] } } }),
  ]);
  return accounts + coupons > 0;
}
