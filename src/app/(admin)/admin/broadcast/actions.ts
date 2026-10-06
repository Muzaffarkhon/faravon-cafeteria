"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { resolveAudience, parseFilters } from "@/lib/broadcast-audience";
import { BOT_URL } from "@/lib/broadcast-templates";
import { LOCALES, type Locale } from "@/lib/i18n/shared";
import { platformUrl } from "@/lib/platform-url";
import { GUEST_MAX, createCampaign, executeCampaign, type BroadcastTexts } from "@/lib/broadcast-send";

export type BroadcastState = { sent?: number; failed?: number; scheduledAt?: string; error?: string };

const LANG_NAME: Record<Locale, string> = { ru: "русском", tg: "таджикском", uz: "узбекском" };

const DUSHANBE_OFFSET = "+05:00";
const MAX_SCHEDULE_DAYS = 60;

/** Рассылка из админки по сегменту/фильтрам (§5.10, BROADCAST): каждый получает текст на своём языке. */
export async function sendBroadcast(
  _prev: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");

  const siteUrl = platformUrl() || "";

  const texts = {} as BroadcastTexts;
  for (const l of LOCALES) {
    const raw = String(formData.get(l === "ru" ? "text" : `text_${l}`) ?? "").trim();
    if (!raw) {
      if (l === "ru") return { error: "Введите текст сообщения на русском." };
      texts[l] = "";
      continue;
    }
    if (raw.length < 2) return { error: `Текст на ${LANG_NAME[l]} слишком короткий.` };
    if (raw.includes("{siteUrl}") && !siteUrl) {
      return { error: "Не задан адрес сайта (PLATFORM_URL) — {siteUrl} в тексте останется пустым. Задайте переменную в настройках сервера или уберите {siteUrl} из текста." };
    }
    const text = raw.replaceAll("{siteUrl}", siteUrl).replaceAll("{botUrl}", BOT_URL);
    if (text.length > 3500) return { error: `Текст на ${LANG_NAME[l]} слишком длинный (максимум 3500 символов).` };
    const leftover = text.match(/\[[^\]\n]{1,40}\]/);
    if (leftover) return { error: `В тексте на ${LANG_NAME[l]} осталась пометка ${leftover[0]} — заполните её или удалите.` };
    texts[l] = text;
  }
  const askConfirm = formData.get("askConfirm") === "on";
  const couponHint = formData.get("couponHint") === "on";
  if (couponHint && !siteUrl) {
    return { error: "Не задан адрес сайта (PLATFORM_URL) — ссылку на раздел купонов не собрать." };
  }

  const filters = parseFilters(Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])));
  if ((askConfirm || couponHint) && filters.segment === "NOT_REGISTERED") {
    return { error: "Кнопки подтверждения и напоминание о купоне — только для сотрудников, не для гостей бота." };
  }

  const rawAt = String(formData.get("scheduledAt") ?? "").trim();
  let scheduledAt: Date | null = null;
  if (rawAt) {
    scheduledAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawAt) ? new Date(`${rawAt}:00${DUSHANBE_OFFSET}`) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return { error: "Неверная дата отправки." };
    if (scheduledAt.getTime() < Date.now() + 60_000) return { error: "Время отправки уже прошло — выберите время в будущем." };
    if (scheduledAt.getTime() > Date.now() + MAX_SCHEDULE_DAYS * 86_400_000) {
      return { error: `Запланировать можно не дальше чем на ${MAX_SCHEDULE_DAYS} дней.` };
    }
  }

  const audience = await resolveAudience(filters);
  if (audience.error) return { error: audience.error };
  const recipients = audience.users.length + audience.guests.length;
  if (recipients === 0) return { error: "Нет получателей по заданному фильтру." };
  if (audience.guests.length > GUEST_MAX) {
    return { error: `Слишком много получателей за раз (${audience.guests.length}, максимум ${GUEST_MAX}).` };
  }
  const expected = Number(formData.get("expected"));
  if (!scheduledAt && formData.has("expected") && expected !== recipients) {
    return { error: `Список получателей изменился: было ${expected}, сейчас ${recipients}. Обновите страницу и проверьте получателей.` };
  }

  const [card, period] =
    filters.segment === "BY_CARD"
      ? await Promise.all([
          db.benefitCard.findUnique({ where: { id: filters.cardId }, select: { title: true } }),
          db.period.findUnique({ where: { id: filters.periodId }, select: { name: true } }),
        ])
      : [null, null];
  const title = card ? [card.title, period?.name].filter(Boolean).join(" · ") : texts.ru.replace(/\s+/g, " ").slice(0, 60);

  const campaign = await createCampaign({ actorId: session.user.id, title, filters, texts, askConfirm, couponHint, scheduledAt });
  revalidatePath("/admin/broadcast", "layout"); // и новая рассылка, и история

  if (scheduledAt) {
    await audit({
      actorId: session.user.id,
      action: "BROADCAST_SCHEDULED",
      entityType: "BroadcastCampaign",
      entityId: campaign.id,
      newValue: { scheduledAt, recipientsNow: recipients, segment: filters.segment, filters, askConfirm, couponHint },
    });
    return { scheduledAt: scheduledAt.toISOString() };
  }
  const r = await executeCampaign(campaign.id, { from: "SENDING" });
  return r.error ? { error: r.error } : { sent: r.sent, failed: r.failed };
}

/** Отменить отложенную рассылку, пока она не ушла. */
export async function cancelScheduledBroadcast(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");
  const r = await db.broadcastCampaign.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
  if (r.count === 0) return { error: "Рассылка уже отправлена или отменена." };
  await audit({ actorId: session.user.id, action: "BROADCAST_CANCELLED", entityType: "BroadcastCampaign", entityId: id });
  revalidatePath("/admin/broadcast", "layout");
  return {};
}

/** Удалить рассылку из истории вместе со строками получателей и ответами. Уже ушедшие сообщения это не отзывает. */
export async function deleteBroadcast(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");
  const c = await db.broadcastCampaign.findUnique({ where: { id }, select: { title: true, seq: true, status: true } });
  if (!c) return { error: "Рассылка не найдена." };
  if (c.status === "SENDING") return { error: "Рассылка отправляется — удалить можно после завершения." };
  await db.broadcastCampaign.delete({ where: { id } });
  await audit({
    actorId: session.user.id,
    action: "BROADCAST_DELETED",
    entityType: "BroadcastCampaign",
    entityId: id,
    oldValue: { seq: c.seq, title: c.title, status: c.status },
  });
  revalidatePath("/admin/broadcast", "layout");
  return {};
}
