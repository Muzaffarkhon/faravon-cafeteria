import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkAutoTasksForEmployee } from "@/lib/gamification-tasks";
import { getWheelSettings } from "@/lib/gamification-settings";
import { grantBonusSpins } from "@/lib/wheel";

const SETTINGS_ID = "default";
const MIN_REPEAT_DAYS = 1;
const MAX_REPEAT_DAYS = 365;

export type SatisfactionSettingsView = { enabled: boolean; repeatDays: number; afterIssueDays: number };
const MAX_AFTER_ISSUE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Настройки опроса — синглтон-строка; отсутствие строки = выключено по умолчанию. */
export async function getSatisfactionSettings(): Promise<SatisfactionSettingsView> {
  const row = await db.satisfactionSettings.findUnique({ where: { id: SETTINGS_ID } });
  return { enabled: row?.enabled ?? false, repeatDays: row?.repeatDays ?? 90, afterIssueDays: row?.afterIssueDays ?? 2 };
}

export async function updateSatisfactionSettings(
  actorId: string,
  enabled: boolean,
  repeatDays: number,
  afterIssueDays: number,
): Promise<void> {
  if (!Number.isFinite(repeatDays) || repeatDays < MIN_REPEAT_DAYS || repeatDays > MAX_REPEAT_DAYS) {
    throw new Error(`Периодичность повтора — от ${MIN_REPEAT_DAYS} до ${MAX_REPEAT_DAYS} дней.`);
  }
  if (!Number.isInteger(afterIssueDays) || afterIssueDays < 0 || afterIssueDays > MAX_AFTER_ISSUE_DAYS) {
    throw new Error(`Задержка после выдачи — от 0 до ${MAX_AFTER_ISSUE_DAYS} дней.`);
  }
  const before = await getSatisfactionSettings();
  await db.satisfactionSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, enabled, repeatDays, afterIssueDays },
    update: { enabled, repeatDays, afterIssueDays },
  });
  await audit({
    actorId,
    action: "SATISFACTION_SETTINGS_UPDATED",
    entityType: "SatisfactionSettings",
    entityId: SETTINGS_ID,
    oldValue: before,
    newValue: { enabled, repeatDays, afterIssueDays },
  });
}

/**
 * Показывать ли сотруднику опрос удовлетворённости сейчас:
 *  - функция включена (SatisfactionSettings.enabled);
 *  - у сотрудника был реальный опыт льготы: купон погашен (USED), ЛИБО купон
 *    выдан / промокод такси доставлен не меньше afterIssueDays назад. Раньше
 *    требовался только USED, но партнёры почти не отмечают погашение (1 из 236
 *    купонов на 2026-10-02) — опрос не видел почти никто, а получатели промокодов
 *    такси (купона у них нет вовсе) не могли увидеть его в принципе;
 *  - сотрудника не спрашивали никогда, либо с последнего ответа прошло
 *    не меньше repeatDays.
 */
export async function isEligibleForSatisfactionSurvey(employeeId: string): Promise<boolean> {
  return (await eligibility(employeeId)).eligible;
}

/** Право на опрос + id последнего ответа (ключ цикла: за один цикл подарок выдаётся один раз). */
async function eligibility(employeeId: string): Promise<{ eligible: boolean; lastResponseId: string | null }> {
  const no = { eligible: false, lastResponseId: null };
  const settings = await getSatisfactionSettings();
  if (!settings.enabled) return no;

  const issuedBefore = new Date(Date.now() - settings.afterIssueDays * DAY_MS);
  const [coupon, taxiPromo, lastResponse] = await Promise.all([
    db.coupon.findFirst({
      where: { employeeId, OR: [{ status: "USED" }, { status: "ISSUED", issuedAt: { lte: issuedBefore } }] },
      select: { id: true },
    }),
    db.notification.findFirst({
      where: { event: "TAXI_PROMO_CODE", deliveredAt: { lte: issuedBefore }, user: { is: { employeeId } } },
      select: { id: true },
    }),
    db.satisfactionResponse.findFirst({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    }),
  ]);
  if (!coupon && !taxiPromo) return no;
  if (!lastResponse) return { eligible: true, lastResponseId: null };

  const nextEligibleAt = new Date(lastResponse.createdAt.getTime() + settings.repeatDays * DAY_MS);
  return { eligible: new Date() >= nextEligibleAt, lastResponseId: lastResponse.id };
}

export async function submitSatisfactionResponse(
  employeeId: string,
  rating: number,
  comment: string | null,
): Promise<{ giftSpins: number }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Оценка должна быть от 1 до 5 звёзд.");
  }
  // Оценку принимаем только когда опрос положен: за неё дарятся прокрутки колеса,
  // иначе их можно было бы «накрутить» повторными вызовами действия.
  const { eligible, lastResponseId } = await eligibility(employeeId);
  if (!eligible) throw new Error("Сейчас оценка не требуется — спасибо!");
  const trimmedComment = comment?.trim() || null;
  await db.satisfactionResponse.create({
    data: { employeeId, rating, comment: trimmedComment },
  });
  // Мгновенная проверка авто-задач геймификации на метрику FEEDBACK_GIVEN —
  // не дожидаясь ночного крона (см. lib/gamification-tasks.ts).
  await checkAutoTasksForEmployee(employeeId, "FEEDBACK_GIVEN").catch(() => {});

  // Подарок за оценку — бесплатные прокрутки колеса (если колесо включено).
  const wheel = await getWheelSettings();
  const giftSpins = wheel.wheelEnabled
    ? await grantBonusSpins({
        employeeId,
        count: wheel.wheelSpinsForRating,
        reason: "Подарок за оценку сервиса",
        // Ключ цикла, а не ответа: два одновременных ответа одного цикла получат подарок один раз.
        opKey: `rating:${employeeId}:${lastResponseId ?? "first"}`,
      })
    : 0;
  return { giftSpins };
}
