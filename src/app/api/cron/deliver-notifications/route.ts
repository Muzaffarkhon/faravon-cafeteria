import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deliverTelegramNotifications } from "@/lib/notification-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron-доставка уведомлений в Telegram для webhook-развёртывания (Vercel),
 * где нет постоянного процесса бота. Расписание — в vercel.json.
 * Vercel Cron автоматически шлёт заголовок `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await deliverTelegramNotifications({
    db,
    token: process.env.TELEGRAM_BOT_TOKEN,
    log: (m) => console.log(`[cron/deliver] ${m}`),
  });

  return NextResponse.json({ ok: true, ...result });
}
