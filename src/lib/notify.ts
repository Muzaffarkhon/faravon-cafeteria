import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { deliverTelegramNotifications } from "@/lib/notification-delivery";
import type { Prisma } from "@prisma/client";

export { NOTIFICATION_LABELS, formatNotificationText } from "@/lib/notification-format";

/**
 * Пытается доставить свежие уведомления в Telegram сразу после ответа пользователю
 * (не блокирует server action). Что не ушло — подберёт cron / `npm run bot`.
 */
function flushTelegram() {
  try {
    after(async () => {
      try {
        await deliverTelegramNotifications({
          db,
          token: process.env.TELEGRAM_BOT_TOKEN,
          log: (m) => console.log(`[notify:inline] ${m}`),
        });
      } catch (e) {
        console.error("[notify:inline] ошибка доставки:", e);
      }
    });
  } catch {
    // after() доступен только в контексте запроса — вне его доставку сделает cron/бот
  }
}

/**
 * Запись уведомления сотруднику, ТЗ v2 §5.10.
 * Канал по умолчанию — Telegram; доставку выполняет flushTelegram() (мгновенно)
 * и, как ретрай, cron-роут / bot/notifications.ts.
 */
export async function notifyEmployee(params: {
  employeeId: string;
  event: string;
  payload?: Prisma.InputJsonValue;
  channel?: string;
}) {
  const user = await db.user.findUnique({
    where: { employeeId: params.employeeId },
    select: { id: true },
  });
  if (!user) return;
  await db.notification.create({
    data: {
      userId: user.id,
      event: params.event,
      channel: params.channel ?? "TELEGRAM",
      payload: params.payload,
    },
  });
  flushTelegram();
}

/**
 * Уведомление всем активным согласующим (роль APPROVER) — например,
 * о новой поданной заявке (§5.7). Пишется каждому согласующему отдельно,
 * доставится тем, у кого привязан Telegram.
 */
export async function notifyApprovers(params: {
  event: string;
  payload?: Prisma.InputJsonValue;
  channel?: string;
}) {
  const approvers = await db.user.findMany({
    where: { isActive: true, roles: { has: "APPROVER" } },
    select: { id: true },
  });
  if (approvers.length === 0) return;
  await db.notification.createMany({
    data: approvers.map((u) => ({
      userId: u.id,
      event: params.event,
      channel: params.channel ?? "TELEGRAM",
      payload: params.payload,
    })),
  });
  flushTelegram();
}
