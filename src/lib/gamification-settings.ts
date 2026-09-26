import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const SETTINGS_ID = "default";

/** Рубильник геймификации — синглтон-строка; отсутствие строки = выключено по умолчанию. */
export async function getGamificationEnabled(): Promise<boolean> {
  const row = await db.gamificationSettings.findUnique({ where: { id: SETTINGS_ID } });
  return row?.enabled ?? false;
}

export async function setGamificationEnabled(actorId: string, enabled: boolean): Promise<void> {
  const before = await getGamificationEnabled();
  await db.gamificationSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, enabled },
    update: { enabled },
  });
  await audit({
    actorId,
    action: "GAMIFICATION_SETTINGS_UPDATED",
    entityType: "GamificationSettings",
    entityId: SETTINGS_ID,
    oldValue: { enabled: before },
    newValue: { enabled },
  });
}
