"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { flushTelegram } from "@/lib/notify";
import { resolveAudience, parseFilters } from "@/lib/broadcast-audience";
import { BOT_URL } from "@/lib/broadcast-templates";
import { LOCALES, type Locale } from "@/lib/i18n/shared";
import { formatNotificationText, templateMapFromRows } from "@/lib/notification-format";
import { sendTelegramDetailed } from "@/lib/notification-delivery";

export type BroadcastState = { sent?: number; failed?: number; error?: string };

// «Гостям» (нажавшим «Старт») пишем напрямую из действия, без очереди: сколько бы их ни было,
// укладываемся в лимит бота (25 сообщений/с) и время функции.
const GUEST_MAX = 600;
const GUEST_BATCH = 25;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const LANG_NAME: Record<Locale, string> = { ru: "русском", tg: "таджикском", uz: "узбекском" };

/** Рассылка из админки по сегменту/фильтрам (§5.10, BROADCAST): каждый получает текст на своём языке. */
export async function sendBroadcast(
  _prev: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");

  // Плейсхолдеры шаблонов подставляем при отправке, чтобы в текстах не хардкодить адрес сайта.
  const siteUrl = (process.env.PLATFORM_URL || "").trim().replace(/\/+$/, "");

  // Русский текст обязателен; перевод, которого нет, заменяется русским.
  const texts = {} as Record<Locale, string>;
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
    // Незаполненные пометки шаблона вроде [дата] не должны уйти сотрудникам.
    const leftover = text.match(/\[[^\]\n]{1,40}\]/);
    if (leftover) return { error: `В тексте на ${LANG_NAME[l]} осталась пометка ${leftover[0]} — заполните её или удалите.` };
    texts[l] = text;
  }
  const textFor = (l: Locale) => texts[l] || texts.ru;

  const filters = parseFilters(Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])));
  const audience = await resolveAudience(filters);
  if (audience.error) return { error: audience.error };
  const recipients = audience.users.length + audience.guests.length;
  if (recipients === 0) return { error: "Нет получателей по заданному фильтру." };

  let sent = 0;
  let failed = 0;

  if (audience.guests.length) {
    if (audience.guests.length > GUEST_MAX) {
      return { error: `Слишком много получателей за раз (${audience.guests.length}, максимум ${GUEST_MAX}).` };
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { error: "Не задан токен бота — отправка невозможна." };
    const rows = await db.notificationTemplate.findMany({ select: { event: true, body: true, translations: true } });
    const templates = templateMapFromRows(rows);
    const html = Object.fromEntries(
      LOCALES.map((l) => [l, formatNotificationText("BROADCAST", { text: textFor(l) }, templates, l)]),
    ) as Record<Locale, string>;

    const chats = audience.guests;
    for (let i = 0; i < chats.length; i += GUEST_BATCH) {
      const batch = chats.slice(i, i + GUEST_BATCH);
      const results = await Promise.all([
        ...batch.map(async (g) => ({ chatId: g.id, r: await sendTelegramDetailed(token, g.id, html[g.locale]) })),
        i + GUEST_BATCH < chats.length ? sleep(1000) : Promise.resolve(),
      ]);
      const blocked: string[] = [];
      for (const x of results) {
        if (!x || typeof x !== "object" || !("r" in x)) continue;
        if (x.r.ok) sent++;
        else {
          failed++;
          if (x.r.blocked) blocked.push(x.chatId);
        }
      }
      // Заблокировавших бота больше не трогаем.
      if (blocked.length) {
        await db.telegramGuest.updateMany({ where: { telegramId: { in: blocked } }, data: { blockedAt: new Date() } });
      }
    }
  } else {
    await db.notification.createMany({
      data: audience.users.map((u) => ({
        userId: u.id,
        event: "BROADCAST",
        channel: "TELEGRAM",
        payload: { text: textFor(u.locale) },
      })),
    });
    sent = audience.users.length;
    flushTelegram();
  }

  await audit({
    actorId: session.user.id,
    action: "BROADCAST_SENT",
    entityType: "Notification",
    newValue: { recipients, sent, failed, segment: filters.segment, filters, byLocale: audience.byLocale, texts },
  });

  revalidatePath("/admin/broadcast");
  return { sent, failed };
}
