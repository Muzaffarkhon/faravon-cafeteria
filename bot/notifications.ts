/**
 * Доставка уведомлений в Telegram для long-polling бота (§5.10).
 * Общая логика — в src/lib/notification-delivery.ts (её же использует
 * cron-роут на Vercel). Здесь только периодический запуск.
 */
import { PrismaClient } from "@prisma/client";
import { deliverTelegramNotifications } from "../src/lib/notification-delivery";

const db = new PrismaClient();

/** Фоновый цикл доставки. Возвращает функцию остановки. */
export function startNotificationLoop(intervalMs = 15_000): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await deliverTelegramNotifications({
        db,
        token: process.env.TELEGRAM_BOT_TOKEN,
        log: (m) => console.log(`[notify] ${m}`),
      });
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
