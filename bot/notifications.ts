/**
 * Доставка уведомлений в Telegram (§5.10).
 * Бот периодически забирает из таблицы Notification непоставленные записи
 * (deliveredAt = null) и отправляет их сотруднику/согласующему, у которого
 * привязан Telegram. Веб-приложение только создаёт записи (src/lib/notify.ts).
 */
import { PrismaClient } from "@prisma/client";
import { formatNotificationText } from "../src/lib/notification-format";

const db = new PrismaClient();

type Send = (chatId: number, text: string) => Promise<unknown>;

export async function deliverPendingNotifications(send: Send): Promise<number> {
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
    take: 25,
  });

  let delivered = 0;
  for (const n of pending) {
    const tgId = n.user.employee?.telegramId;
    if (!tgId) continue;
    try {
      await send(
        Number(tgId),
        "🔔 " + formatNotificationText(n.event, n.payload as Record<string, unknown> | null),
      );
      await db.notification.update({
        where: { id: n.id },
        data: { deliveredAt: new Date() },
      });
      delivered++;
    } catch (e) {
      console.error(`[notify] не удалось отправить ${n.id}:`, e);
    }
  }
  return delivered;
}

/** Фоновый цикл доставки. Возвращает функцию остановки. */
export function startNotificationLoop(send: Send, intervalMs = 15_000): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const n = await deliverPendingNotifications(send);
      if (n > 0) console.log(`[notify] доставлено уведомлений: ${n}`);
    } catch (e) {
      console.error("[notify] ошибка цикла доставки:", e);
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
