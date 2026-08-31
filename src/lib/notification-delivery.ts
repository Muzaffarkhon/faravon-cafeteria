/**
 * Доставка накопленных уведомлений в Telegram (§5.10).
 * Общий модуль без server-only: используется и cron-роутом на Vercel
 * (src/app/api/cron/deliver-notifications), и long-polling ботом (bot/notifications.ts).
 * Принимает Prisma-клиент параметром, чтобы каждая сторона передавала свой.
 */
import type { PrismaClient } from "@prisma/client";
import { formatNotificationText } from "./notification-format";

const TG_API = "https://api.telegram.org";

async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data = (await r.json().catch(() => null)) as { ok?: boolean } | null;
    return !!data?.ok;
  } catch {
    return false;
  }
}

export type DeliveryResult = { delivered: number; failed: number; skipped: number };

/**
 * Отправляет непоставленные Telegram-уведомления адресатам с привязанным Telegram
 * и проставляет deliveredAt. Возвращает статистику.
 */
export async function deliverTelegramNotifications(opts: {
  db: PrismaClient;
  token: string | undefined;
  limit?: number;
  log?: (msg: string) => void;
}): Promise<DeliveryResult> {
  const { db, token, limit = 25, log } = opts;
  if (!token) {
    log?.("TELEGRAM_BOT_TOKEN не задан — доставка пропущена.");
    return { delivered: 0, failed: 0, skipped: 0 };
  }

  const pending = await db.notification.findMany({
    where: {
      deliveredAt: null,
      channel: "TELEGRAM",
      user: { is: { employee: { is: { telegramId: { not: null } } } } },
    },
    select: {
      id: true,
      event: true,
      payload: true,
      user: { select: { employee: { select: { telegramId: true } } } },
    },
    orderBy: { sentAt: "asc" },
    take: limit,
  });

  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of pending) {
    const tgId = n.user.employee?.telegramId;
    if (!tgId) {
      skipped++;
      continue;
    }
    const text = "🔔 " + formatNotificationText(n.event, n.payload as Record<string, unknown> | null);
    const ok = await sendTelegram(token, tgId, text);
    if (ok) {
      await db.notification.update({ where: { id: n.id }, data: { deliveredAt: new Date() } });
      delivered++;
    } else {
      failed++;
      log?.(`не удалось отправить уведомление ${n.id}`);
    }
  }

  if (delivered || failed) log?.(`доставлено ${delivered}, ошибок ${failed}`);
  return { delivered, failed, skipped };
}
