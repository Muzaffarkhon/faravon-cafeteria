import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const SETTINGS_ID = "default";
const MIN_REPEAT_DAYS = 1;
const MAX_REPEAT_DAYS = 365;

export type SatisfactionSettingsView = { enabled: boolean; repeatDays: number };

/** Настройки опроса — синглтон-строка; отсутствие строки = выключено по умолчанию. */
export async function getSatisfactionSettings(): Promise<SatisfactionSettingsView> {
  const row = await db.satisfactionSettings.findUnique({ where: { id: SETTINGS_ID } });
  return { enabled: row?.enabled ?? false, repeatDays: row?.repeatDays ?? 90 };
}

export async function updateSatisfactionSettings(
  actorId: string,
  enabled: boolean,
  repeatDays: number,
): Promise<void> {
  if (!Number.isFinite(repeatDays) || repeatDays < MIN_REPEAT_DAYS || repeatDays > MAX_REPEAT_DAYS) {
    throw new Error(`Периодичность повтора — от ${MIN_REPEAT_DAYS} до ${MAX_REPEAT_DAYS} дней.`);
  }
  const before = await getSatisfactionSettings();
  await db.satisfactionSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, enabled, repeatDays },
    update: { enabled, repeatDays },
  });
  await audit({
    actorId,
    action: "SATISFACTION_SETTINGS_UPDATED",
    entityType: "SatisfactionSettings",
    entityId: SETTINGS_ID,
    oldValue: before,
    newValue: { enabled, repeatDays },
  });
}

/**
 * Показывать ли сотруднику опрос удовлетворённости сейчас:
 *  - функция включена (SatisfactionSettings.enabled);
 *  - у сотрудника есть хотя бы один реально погашенный купон (USED) —
 *    спрашиваем про пережитый опыт, а не про сам факт получения QR;
 *  - сотрудника не спрашивали никогда, либо с последнего ответа прошло
 *    не меньше repeatDays.
 */
export async function isEligibleForSatisfactionSurvey(employeeId: string): Promise<boolean> {
  const settings = await getSatisfactionSettings();
  if (!settings.enabled) return false;

  const [usedCoupon, lastResponse] = await Promise.all([
    db.coupon.findFirst({ where: { employeeId, status: "USED" }, select: { id: true } }),
    db.satisfactionResponse.findFirst({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  if (!usedCoupon) return false;
  if (!lastResponse) return true;

  const nextEligibleAt = new Date(lastResponse.createdAt.getTime() + settings.repeatDays * 24 * 60 * 60 * 1000);
  return new Date() >= nextEligibleAt;
}

export async function submitSatisfactionResponse(
  employeeId: string,
  rating: number,
  comment: string | null,
): Promise<void> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Оценка должна быть от 1 до 5 звёзд.");
  }
  const trimmedComment = comment?.trim() || null;
  await db.satisfactionResponse.create({
    data: { employeeId, rating, comment: trimmedComment },
  });
}
