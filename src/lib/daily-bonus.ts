import "server-only";
import { db } from "@/lib/db";
import { creditCoins } from "@/lib/coin-wallet";
import { getGamificationEnabled, getDailyBonusCoins } from "@/lib/gamification-settings";

const TIMEZONE = "Asia/Dushanbe";

/** Календарная дата по душанбинскому времени (UTC+5) — граница "нового дня" для бонуса. */
export function dushanbeDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dailyBonusOpKey(employeeId: string, date: Date = new Date()): string {
  return `daily-bonus:${employeeId}:${dushanbeDateKey(date)}`;
}

export type DailyBonusStatus = { available: boolean; amount: number; claimedToday: boolean };

/** Доступен ли сегодня ещё не собранный бонус — для отображения кнопки/состояния. */
export async function getDailyBonusStatus(employeeId: string): Promise<DailyBonusStatus> {
  const [enabled, amount] = await Promise.all([getGamificationEnabled(), getDailyBonusCoins()]);
  if (!enabled || amount <= 0) return { available: false, amount, claimedToday: false };
  const existing = await db.coinEntry.findUnique({ where: { opKey: dailyBonusOpKey(employeeId) }, select: { id: true } });
  return { available: true, amount, claimedToday: !!existing };
}

export class DailyBonusError extends Error {}

/** Начисляет ежедневный бонус. Idempotent по дате (Душанбе) — повторный сбор в тот же день не удваивает. */
export async function claimDailyBonus(employeeId: string): Promise<number> {
  const { available, amount, claimedToday } = await getDailyBonusStatus(employeeId);
  if (!available) throw new DailyBonusError("Ежедневный бонус сейчас не начисляется.");
  if (claimedToday) throw new DailyBonusError("Сегодняшний бонус уже получен — приходите завтра.");
  await creditCoins({
    employeeId,
    amount,
    reason: "Ежедневный визит",
    opKey: dailyBonusOpKey(employeeId),
  });
  return amount;
}
