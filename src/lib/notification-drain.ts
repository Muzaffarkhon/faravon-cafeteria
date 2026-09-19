import type { PrismaClient } from "@prisma/client";
import { deliverTelegramNotifications, type DeliveryResult } from "@/lib/notification-delivery";

/** Размер одного прохода доставки (≈12 с при 25 сообщениях в секунду). */
const PASS_LIMIT = 300;

/**
 * Доставка «пока укладываемся во время»: несколько проходов подряд, пока очередь не
 * опустеет или не выйдет бюджет времени. Один проход — 300 сообщений, поэтому при
 * рассылке всем сотрудникам за один запуск cron уходит несколько проходов, а не только 300 человек.
 *
 * `budgetMs` — сколько миллисекунд можно ЗАПУСКАТЬ новые проходы: последний стартует не позже
 * этого срока и идёт ещё ~12 с, так что бюджет должен быть меньше `maxDuration` функции минус
 * запас в ~15 с. Если за проход ничего не доставлено (всё «отравлено»/заблокировано) — выходим сразу.
 */
export async function drainTelegramNotifications(opts: {
  db: PrismaClient;
  token: string | undefined;
  budgetMs: number;
  log?: (msg: string) => void;
}): Promise<DeliveryResult & { passes: number }> {
  const start = Date.now();
  const total: DeliveryResult = { delivered: 0, failed: 0, skipped: 0 };
  let passes = 0;
  for (;;) {
    const r = await deliverTelegramNotifications({ db: opts.db, token: opts.token, limit: PASS_LIMIT, log: opts.log });
    passes += 1;
    total.delivered += r.delivered;
    total.failed += r.failed;
    total.skipped += r.skipped;
    const handled = r.delivered + r.failed + r.skipped;
    if (handled < PASS_LIMIT || r.delivered === 0) break; // очередь опустела или ничего не уходит
    if (Date.now() - start > opts.budgetMs) break; // время вышло — остаток доставит следующий запуск
  }
  return { ...total, passes };
}
