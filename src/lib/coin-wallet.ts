import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export class CoinWalletError extends Error {}

export async function getCoinBalance(employeeId: string): Promise<number> {
  const account = await db.coinAccount.findUnique({ where: { employeeId }, select: { balance: true } });
  return account?.balance ?? 0;
}

/** Начисление монет. Idempotent по opKey — повторный вызов с тем же ключом ничего не меняет. */
export async function creditCoins(params: {
  employeeId: string;
  amount: number;
  reason: string;
  opKey: string;
  taskId?: string;
}): Promise<void> {
  if (!Number.isSafeInteger(params.amount) || params.amount <= 0) {
    throw new CoinWalletError("Сумма начисления должна быть положительным целым числом.");
  }
  const existing = await db.coinEntry.findUnique({ where: { opKey: params.opKey } });
  if (existing) return;

  try {
    await db.$transaction((tx) => creditCoinsTx(tx, params));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return; // параллельный дубль — уже начислено
    throw e;
  }
}

/** Начисление внутри чужой транзакции — откатывается вместе с ней. */
export async function creditCoinsTx(
  tx: Prisma.TransactionClient,
  params: { employeeId: string; amount: number; reason: string; opKey: string; taskId?: string },
): Promise<void> {
  const account = await tx.coinAccount.upsert({
    where: { employeeId: params.employeeId },
    create: { employeeId: params.employeeId },
    update: {},
  });
  await tx.coinAccount.update({ where: { id: account.id }, data: { balance: { increment: params.amount } } });
  await tx.coinEntry.create({
    data: {
      accountId: account.id,
      kind: "EARNED",
      amount: params.amount,
      reason: params.reason,
      taskId: params.taskId,
      opKey: params.opKey,
    },
  });
}

/** Списание монет. Idempotent по opKey. Баланс не уходит в минус (условный decrement). */
export async function spendCoins(params: {
  employeeId: string;
  amount: number;
  reason: string;
  opKey: string;
  redemptionId?: string;
}): Promise<void> {
  if (!Number.isSafeInteger(params.amount) || params.amount <= 0) {
    throw new CoinWalletError("Сумма списания должна быть положительным целым числом.");
  }
  const existing = await db.coinEntry.findUnique({ where: { opKey: params.opKey } });
  if (existing) return;

  try {
    await db.$transaction((tx) => spendCoinsTx(tx, params));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
}

/** Списание внутри чужой транзакции — откатывается вместе с ней. */
export async function spendCoinsTx(
  tx: Prisma.TransactionClient,
  params: { employeeId: string; amount: number; reason: string; opKey: string; redemptionId?: string },
): Promise<void> {
  const account = await tx.coinAccount.upsert({
    where: { employeeId: params.employeeId },
    create: { employeeId: params.employeeId },
    update: {},
  });
  const claimed = await tx.coinAccount.updateMany({
    where: { id: account.id, balance: { gte: params.amount } },
    data: { balance: { decrement: params.amount } },
  });
  if (claimed.count === 0) throw new CoinWalletError("Недостаточно монет на балансе.");
  await tx.coinEntry.create({
    data: {
      accountId: account.id,
      kind: "SPENT",
      amount: params.amount,
      reason: params.reason,
      redemptionId: params.redemptionId,
      opKey: params.opKey,
    },
  });
}

/** Возврат ранее списанных монет (отказ в REQUEST-покупке). Ищет запись SPENT по opKey. */
export async function reverseSpend(params: { opKey: string; reason: string }): Promise<void> {
  const spent = await db.coinEntry.findUnique({ where: { opKey: params.opKey } });
  if (!spent || spent.kind !== "SPENT") throw new CoinWalletError("Операция списания не найдена.");
  const reverseKey = `rev:${spent.id}`;
  const already = await db.coinEntry.findUnique({ where: { opKey: reverseKey } });
  if (already) return;

  try {
    await db.$transaction(async (tx) => {
      await tx.coinAccount.update({ where: { id: spent.accountId }, data: { balance: { increment: spent.amount } } });
      await tx.coinEntry.create({
        data: {
          accountId: spent.accountId,
          kind: "REVERSED",
          amount: spent.amount,
          reason: params.reason,
          redemptionId: spent.redemptionId,
          opKey: reverseKey,
          reversesEntryId: spent.id,
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return; // параллельный дубль — уже возвращено
    throw e;
  }
}

export function listCoinEntries(employeeId: string, take = 20) {
  return db.coinEntry.findMany({
    where: { account: { is: { employeeId } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}
