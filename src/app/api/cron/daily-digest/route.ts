import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runDailyDigest } from "@/lib/daily-digest";
import { runSlaEscalations } from "@/lib/sla-escalation";
import { deliverTelegramNotifications } from "@/lib/notification-delivery";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
// Рассылка идёт пачками с паузой (см. notification-delivery) — на 300
// уведомлений нужно ~12 с, дефолтных 10 с функции не хватит.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cron ежедневного отчёта по заявкам (§12) + SLA-эскалаций (§5.12), объединены
 * в один запуск — на бесплатном Vercel Hobby лимит в 2 cron-задачи, а их
 * (deliver-notifications/sla-escalations/daily-digest) было три. Запускать раз
 * в сутки (см. vercel.json). Защита — `Authorization: Bearer $CRON_SECRET`.
 * Идемпотентно в рамках суток: повторный вызов не задублирует рассылку.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const escalation = await runSlaEscalations({
    db,
    log: (m) => console.log(`[cron/daily-digest:sla] ${m}`),
  });

  const digest = await runDailyDigest();

  const delivery = await deliverTelegramNotifications({
    db,
    token: process.env.TELEGRAM_BOT_TOKEN,
    log: (m) => console.log(`[cron/daily-digest] ${m}`),
  });

  return NextResponse.json({ ok: true, escalation, digest, delivery });
}
