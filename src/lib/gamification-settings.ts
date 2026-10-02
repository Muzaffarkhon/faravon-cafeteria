import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const SETTINGS_ID = "default";
const DEFAULTS = { enabled: false, dailyBonusCoins: 5 } as const;

type SettingsRow = Awaited<ReturnType<typeof db.gamificationSettings.findUnique>>;
let cachedRow: { row: SettingsRow; loadedAt: number } | null = null;
const SETTINGS_TTL_MS = 30_000;

async function getRawSettings(): Promise<SettingsRow> {
  const now = Date.now();
  if (cachedRow && now - cachedRow.loadedAt < SETTINGS_TTL_MS) {
    return cachedRow.row;
  }
  const row = await db.gamificationSettings.findUnique({ where: { id: SETTINGS_ID } });
  cachedRow = { row, loadedAt: now };
  return row;
}

export function invalidateGamificationSettingsCache() {
  cachedRow = null;
}

/** Рубильник геймификации — синглтон-строка; отсутствие строки = выключено по умолчанию. */
export async function getGamificationEnabled(): Promise<boolean> {
  const row = await getRawSettings();
  return row?.enabled ?? DEFAULTS.enabled;
}

/** Сколько монет даёт ежедневный визит (§ daily bonus). 0 — бонус выключен. */
export async function getDailyBonusCoins(): Promise<number> {
  const row = await getRawSettings();
  return row?.dailyBonusCoins ?? DEFAULTS.dailyBonusCoins;
}

export type WheelSettings = {
  wheelEnabled: boolean;
  wheelSpinCost: number;
  wheelDailyLimit: number;
  /** Подаренных прокруток за оценку в опросе удовлетворённости. */
  wheelSpinsForRating: number;
};

export async function getWheelSettings(): Promise<WheelSettings> {
  const row = await getRawSettings();
  return {
    wheelEnabled: row?.wheelEnabled ?? false,
    wheelSpinCost: row?.wheelSpinCost ?? 0,
    wheelDailyLimit: row?.wheelDailyLimit ?? 1,
    wheelSpinsForRating: row?.wheelSpinsForRating ?? 1,
  };
}

export async function setWheelSettings(actorId: string, next: WheelSettings): Promise<void> {
  const before = await getWheelSettings();
  await db.gamificationSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...next },
    update: next,
  });
  invalidateGamificationSettingsCache();
  await audit({
    actorId,
    action: "GAMIFICATION_SETTINGS_UPDATED",
    entityType: "GamificationSettings",
    entityId: SETTINGS_ID,
    oldValue: before,
    newValue: next,
  });
}

export async function setGamificationEnabled(actorId: string, enabled: boolean): Promise<void> {
  const before = await getGamificationEnabled();
  await db.gamificationSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, enabled },
    update: { enabled },
  });
  invalidateGamificationSettingsCache();
  await audit({
    actorId,
    action: "GAMIFICATION_SETTINGS_UPDATED",
    entityType: "GamificationSettings",
    entityId: SETTINGS_ID,
    oldValue: { enabled: before },
    newValue: { enabled },
  });
}

export async function setDailyBonusCoins(actorId: string, dailyBonusCoins: number): Promise<void> {
  const before = await getDailyBonusCoins();
  await db.gamificationSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, dailyBonusCoins },
    update: { dailyBonusCoins },
  });
  invalidateGamificationSettingsCache();
  await audit({
    actorId,
    action: "GAMIFICATION_SETTINGS_UPDATED",
    entityType: "GamificationSettings",
    entityId: SETTINGS_ID,
    oldValue: { dailyBonusCoins: before },
    newValue: { dailyBonusCoins },
  });
}
