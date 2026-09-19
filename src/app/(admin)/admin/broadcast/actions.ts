"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { flushTelegram } from "@/lib/notify";
import { resolveAudience, parseFilters } from "@/lib/broadcast-audience";
import { BOT_URL } from "@/lib/broadcast-templates";
import { formatNotificationText } from "@/lib/notification-format";
import { sendTelegramDetailed } from "@/lib/notification-delivery";

export type BroadcastState = { sent?: number; failed?: number; error?: string };

// «Гостям» (нажавшим «Старт») пишем напрямую из действия, без очереди: сколько бы их ни было,
// укладываемся в лимит бота (25 сообщений/с) и время функции.
const GUEST_MAX = 600;
const GUEST_BATCH = 25;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Рассылка сообщения из админки по сегменту/фильтрам (§5.10, BROADCAST). */
export async function sendBroadcast(
  _prev: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");

  const raw = String(formData.get("text") ?? "").trim();
  if (raw.length < 2) return { error: "Введите текст сообщения." };
  // Плейсхолдеры шаблонов подставляем при отправке, чтобы в текстах не хардкодить адрес сайта.
  const text = raw
    .replaceAll("{siteUrl}", process.env.PLATFORM_URL || "")
    .replaceAll("{botUrl}", BOT_URL);
  if (text.length > 3500) return { error: "Текст слишком длинный (максимум 3500 символов)." };
  // Незаполненные пометки шаблона вроде [дата] не должны уйти сотрудникам.
  const leftover = text.match(/\[[^\]\n]{1,40}\]/);
  if (leftover) return { error: `В тексте осталась пометка ${leftover[0]} — заполните её или удалите.` };

  const filters = parseFilters(Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])));
  const audience = await resolveAudience(filters);
  if (audience.error) return { error: audience.error };
  const recipients = audience.userIds.length + audience.guestChatIds.length;
  if (recipients === 0) return { error: "Нет получателей по заданному фильтру." };

  let sent = 0;
  let failed = 0;

  if (audience.guestChatIds.length) {
    if (audience.guestChatIds.length > GUEST_MAX) {
      return { error: `Слишком много получателей за раз (${audience.guestChatIds.length}, максимум ${GUEST_MAX}).` };
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { error: "Не задан токен бота — отправка невозможна." };
    const rows = await db.notificationTemplate.findMany({ select: { event: true, body: true } });
    const html = formatNotificationText("BROADCAST", { text }, new Map(rows.map((r) => [r.event, r.body])));

    const chats = audience.guestChatIds;
    for (let i = 0; i < chats.length; i += GUEST_BATCH) {
      const batch = chats.slice(i, i + GUEST_BATCH);
      const results = await Promise.all([
        ...batch.map(async (chatId) => ({ chatId, r: await sendTelegramDetailed(token, chatId, html) })),
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
      data: audience.userIds.map((userId) => ({
        userId,
        event: "BROADCAST",
        channel: "TELEGRAM",
        payload: { text },
      })),
    });
    sent = audience.userIds.length;
    flushTelegram();
  }

  await audit({
    actorId: session.user.id,
    action: "BROADCAST_SENT",
    entityType: "Notification",
    newValue: { recipients, sent, failed, segment: filters.segment, filters, text },
  });

  revalidatePath("/admin/broadcast");
  return { sent, failed };
}
