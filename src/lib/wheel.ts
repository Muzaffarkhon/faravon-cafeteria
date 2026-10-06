import "server-only";
import { randomInt } from "node:crypto";
import { Prisma, type WheelPrizeKind } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { creditCoinsTx, spendCoinsTx, reverseSpend, CoinWalletError } from "@/lib/coin-wallet";
import { formCouponForItem, issueCouponIfReady } from "@/lib/coupon-flow";
import { ensureGrantApplication } from "@/lib/coin-redemption";
import { resolveSelectionContext } from "@/lib/selection";
import { getWheelSettings } from "@/lib/gamification-settings";
import { dushanbeDateKey } from "@/lib/dushanbe-date";

export class WheelError extends Error {}
/** Выбранный приз ушёл у нас из-под рук (последний купон забрал другой) — выбираем заново. */
class PrizeTaken extends Error {}

export const WHEEL_MAX_SECTORS = 16;

const sectorInclude = { card: { include: { partner: true } } } satisfies Prisma.WheelSectorInclude;
export type WheelSectorRow = Prisma.WheelSectorGetPayload<{ include: typeof sectorInclude }>;
type PrizeCard = NonNullable<WheelSectorRow["card"]>;

export function listWheelSectors(opts: { includeInactive?: boolean } = {}) {
  return db.wheelSector.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: sectorInclude,
  });
}

/** Почему льготу нельзя разыгрывать (null — можно). Те же ограничения, что у покупки за монеты. */
export function prizeCardProblem(
  card: Pick<PrizeCard, "status" | "isActive" | "archivedAt" | "minParticipants"> & {
    partner: { deliveryMode: string } | null;
  },
): string | null {
  if (card.status !== "PUBLISHED" || !card.isActive || card.archivedAt) return "льгота не опубликована или в архиве";
  if (card.minParticipants > 1) return "групповую льготу разыграть нельзя";
  if (card.partner?.deliveryMode === "PHONE_PROMO") return "льгота выдаётся по номеру телефона, без купона";
  return null;
}

export function wheelSectorLabel(s: Pick<WheelSectorRow, "kind" | "label" | "coins" | "card">): string {
  if (s.label?.trim()) return s.label.trim();
  if (s.kind === "COINS") return `+${s.coins ?? 0}`;
  if (s.kind === "COUPON") return s.card?.title ?? "Купон";
  return "Повезёт завтра";
}

/** null — листок может выпасть; иначе причина, по которой он сейчас мимо этого сотрудника. */
export type SectorBlock = "soldOut" | "taken" | "noPeriod" | "cardUnavailable" | null;

async function sectorBlocks(employeeId: string, sectors: WheelSectorRow[], periodId: string | null) {
  const takenCardIds = new Set<string>();
  if (periodId && sectors.some((s) => s.kind === "COUPON")) {
    const items = await db.applicationItem.findMany({
      where: { application: { is: { employeeId, periodId } } },
      select: { cardId: true },
    });
    for (const i of items) takenCardIds.add(i.cardId);
  }
  const out = new Map<string, SectorBlock>();
  for (const s of sectors) {
    let block: SectorBlock = null;
    if (s.kind === "COUPON") {
      if (!s.card || prizeCardProblem(s.card)) block = "cardUnavailable";
      else if (s.wonCount >= (s.quantity ?? 0)) block = "soldOut";
      else if (!periodId) block = "noPeriod";
      else if (takenCardIds.has(s.card.id)) block = "taken";
    }
    out.set(s.id, block);
  }
  return out;
}

export async function getWheelState(employeeId: string) {
  const dayKey = dushanbeDateKey();
  const [settings, sectors, ctx, spinsTodayCount, bonusSpins] = await Promise.all([
    getWheelSettings(),
    listWheelSectors(),
    resolveSelectionContext(),
    db.wheelSpin.count({ where: { employeeId, dayKey, bonus: false } }),
    countBonusSpins(employeeId),
  ]);
  const blocks = await sectorBlocks(employeeId, sectors, ctx.targetPeriod?.id ?? null);
  const dailyLimit = settings.wheelDailyLimit;
  const spinsRemaining = Math.max(0, dailyLimit - spinsTodayCount) + bonusSpins;
  return {
    enabled: settings.wheelEnabled,
    cost: settings.wheelSpinCost,
    dailyLimit,
    spinsTodayCount,
    bonusSpins,
    spinsRemaining,
    spunToday: spinsRemaining <= 0,
    sectors: sectors.map((s) => ({ ...s, block: blocks.get(s.id) ?? null })),
  };
}

/** Неистраченные подаренные прокрутки. */
export function countBonusSpins(employeeId: string) {
  return db.wheelBonusSpin.count({ where: { employeeId, usedAt: null } });
}

/**
 * Подарить прокрутки (за оценку и т. п.). opKey — ключ события: повторный вызов
 * с тем же ключом ничего не выдаёт (createMany + skipDuplicates по уникальному opKey).
 */
export async function grantBonusSpins(params: { employeeId: string; count: number; reason: string; opKey: string }) {
  if (params.count <= 0) return 0;
  const r = await db.wheelBonusSpin.createMany({
    data: Array.from({ length: params.count }, (_, i) => ({
      employeeId: params.employeeId,
      reason: params.reason,
      opKey: `${params.opKey}:${i}`,
    })),
    skipDuplicates: true,
  });
  return r.count;
}

export function listWheelSpins(employeeId: string, take = 20) {
  return db.wheelSpin.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" }, take });
}

function pickWeighted<T extends { weight: number }>(list: T[]): T {
  const total = list.reduce((sum, s) => sum + s.weight, 0);
  let r = randomInt(total);
  for (const s of list) {
    if (r < s.weight) return s;
    r -= s.weight;
  }
  return list[list.length - 1];
}

export type SpinResult = {
  spinId: string;
  sectorId: string;
  kind: WheelPrizeKind;
  prizeLabel: string;
  coins: number | null;
  cardId: string | null;
};

/**
 * Прокрутка. Результат выбирает сервер (crypto.randomInt по весам), анимация на
 * клиенте лишь докручивает колесо до выбранного листка.
 *
 * Защита от гонок — в одной транзакции:
 * - WheelSpin @@unique([employeeId, dayKey]) — вторая прокрутка за сутки падает на вставке;
 * - списание цены прокрутки условным UPDATE (баланс не уходит в минус);
 * - купон: UPDATE … WHERE wonCount < quantity — из N одновременных прокруток
 *   последний купон получит ровно одна, остальные уйдут на повторный выбор.
 */
export async function spinWheel(employeeId: string, actorId: string): Promise<SpinResult> {
  const settings = await getWheelSettings();
  if (!settings.wheelEnabled) throw new WheelError("Колесо подарков сейчас выключено.");

  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { archivedAt: true, status: true } });
  if (!employee || employee.archivedAt || employee.status === "TERMINATED") {
    throw new WheelError("Колесо доступно только действующим сотрудникам.");
  }

  const dayKey = dushanbeDateKey();
  const [spinsCount, bonusLeft] = await Promise.all([
    db.wheelSpin.count({ where: { employeeId, dayKey, bonus: false } }),
    countBonusSpins(employeeId),
  ]);
  const useBonus = spinsCount >= settings.wheelDailyLimit;
  if (useBonus && bonusLeft === 0) {
    throw new WheelError(`Лимит прокруток на сегодня исчерпан (${settings.wheelDailyLimit} из ${settings.wheelDailyLimit}) — приходите завтра.`);
  }

  const ctx = await resolveSelectionContext();
  const period = ctx.targetPeriod;
  const cost = useBonus ? 0 : settings.wheelSpinCost;

  for (let attempt = 0; attempt < 4; attempt++) {
    const sectors = await listWheelSectors();
    const blocks = await sectorBlocks(employeeId, sectors, period?.id ?? null);
    const candidates = sectors.filter((s) => s.weight > 0 && !blocks.get(s.id));
    if (candidates.length === 0) throw new WheelError("Сейчас разыгрывать нечего — загляните позже.");
    const chosen = pickWeighted(candidates);
    const application = chosen.kind === "COUPON" ? await ensureGrantApplication(employeeId, ctx) : null;
    const prizeLabel = wheelSectorLabel(chosen);

    let spin;
    try {
      spin = await db.$transaction(async (tx) => {
        if (!useBonus) {
          const countInsideTx = await tx.wheelSpin.count({ where: { employeeId, dayKey, bonus: false } });
          if (countInsideTx >= settings.wheelDailyLimit) {
            throw new WheelError("Лимит прокруток на сегодня исчерпан.");
          }
        }
        const created = await tx.wheelSpin.create({
          data: {
            employeeId,
            dayKey,
            bonus: useBonus,
            sectorId: chosen.id,
            kind: chosen.kind,
            prizeLabel,
            coins: chosen.kind === "COINS" ? chosen.coins : null,
            cardId: chosen.kind === "COUPON" ? chosen.cardId : null,
            periodId: period?.id ?? null,
            cost,
          },
        });
        if (useBonus) {
          const grant = await tx.wheelBonusSpin.findFirst({
            where: { employeeId, usedAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });
          const claimed = grant
            ? await tx.wheelBonusSpin.updateMany({
                where: { id: grant.id, usedAt: null },
                data: { usedAt: new Date(), spinId: created.id },
              })
            : { count: 0 };
          if (claimed.count === 0) throw new WheelError("Подаренные прокрутки закончились.");
        }
        if (cost > 0) {
          await spendCoinsTx(tx, { employeeId, amount: cost, reason: "Прокрутка колеса подарков", opKey: `wheel:${created.id}` });
        }
        if (chosen.kind === "COUPON") {
          const claimed = await tx.wheelSector.updateMany({
            where: { id: chosen.id, isActive: true, wonCount: { lt: tx.wheelSector.fields.quantity } },
            data: { wonCount: { increment: 1 } },
          });
          if (claimed.count === 0) throw new PrizeTaken();
          let item;
          try {
            item = await tx.applicationItem.create({
              data: { applicationId: application!.id, cardId: chosen.cardId!, status: "APPROVED", viaCoins: true, viaWheel: true },
            });
          } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new PrizeTaken();
            throw e;
          }
          return tx.wheelSpin.update({ where: { id: created.id }, data: { itemId: item.id } });
        }
        if (chosen.kind === "COINS" && chosen.coins && chosen.coins > 0) {
          await creditCoinsTx(tx, { employeeId, amount: chosen.coins, reason: "Выигрыш в колесе подарков", opKey: `wheel-win:${created.id}` });
        }
        return created;
      },
      { maxWait: 15_000, timeout: 20_000 });
    } catch (e) {
      if (e instanceof WheelError) throw e;
      if (e instanceof PrizeTaken) continue;
      if (e instanceof CoinWalletError) throw new WheelError(`Не хватает монет: прокрутка стоит ${cost}.`);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new WheelError("Лимит прокруток на сегодня исчерпан.");
      }
      throw e;
    }

    if (spin.itemId) await issueWonCoupon(spin, actorId);
    await audit({
      actorId,
      action: "WHEEL_SPIN",
      entityType: "WheelSpin",
      entityId: spin.id,
      newValue: { kind: spin.kind, prize: prizeLabel, cost, bonus: useBonus },
    });
    return { spinId: spin.id, sectorId: chosen.id, kind: spin.kind, prizeLabel, coins: spin.coins, cardId: spin.cardId };
  }
  throw new WheelError("Много одновременных прокруток — попробуйте ещё раз.");
}

/**
 * Купон формируется после коммита (как при покупке за монеты). Если это сорвалось —
 * откатываем выигрыш целиком: снимаем позицию, возвращаем купон в розыгрыш и монеты
 * за прокрутку, удаляем прокрутку — сотрудник сможет крутить сегодня ещё раз.
 */
async function issueWonCoupon(spin: { id: string; itemId: string | null; sectorId: string | null; cost: number }, actorId: string) {
  try {
    const coupon = await formCouponForItem(spin.itemId!, actorId);
    await issueCouponIfReady(coupon.id, actorId);
  } catch (e) {
    await db.applicationItem
      .delete({ where: { id: spin.itemId! } })
      .catch(() => db.applicationItem.update({ where: { id: spin.itemId! }, data: { status: "CANCELLED" } }))
      .catch(() => {});
    if (spin.sectorId) {
      await db.wheelSector.updateMany({ where: { id: spin.sectorId, wonCount: { gt: 0 } }, data: { wonCount: { decrement: 1 } } });
    }
    if (spin.cost > 0) await reverseSpend({ opKey: `wheel:${spin.id}`, reason: "Купон из колеса не выдан — монеты возвращены" });
    await db.wheelSpin.delete({ where: { id: spin.id } });
    await audit({ actorId, action: "WHEEL_COUPON_FAILED", entityType: "WheelSpin", entityId: spin.id });
    console.error("[wheel] не удалось выдать купон", e);
    throw new WheelError("Не удалось выдать купон — прокрутка не засчитана, попробуйте ещё раз.");
  }
}
