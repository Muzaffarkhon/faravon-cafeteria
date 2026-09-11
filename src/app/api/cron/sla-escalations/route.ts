import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runSlaEscalations } from "@/lib/sla-escalation";
import { deliverTelegramNotifications } from "@/lib/notification-delivery";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
// Рассылка идёт пачками с паузой (см. notification-delivery) — на 300
// уведомлений нужно ~12 с, дефолтных 10 с функции не хватит.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cron SLA-эскалаций (§5.12). Достаточно запускать раз в 10–15 мин.
 * Защита — заголовок `Authorization: Bearer $CRON_SECRET` (как cron-job.org).
 * После эскалации сразу пытается доставить накопившиеся уведомления в Telegram.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const escalation = await runSlaEscalations({
    db,
    log: (m) => console.log(`[cron/sla] ${m}`),
  });

  const delivery = await deliverTelegramNotifications({
    db,
    token: process.env.TELEGRAM_BOT_TOKEN,
    log: (m) => console.log(`[cron/sla:deliver] ${m}`),
  });

  return NextResponse.json({ ok: true, escalation, delivery });
}
