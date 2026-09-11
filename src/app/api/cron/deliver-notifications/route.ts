import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deliverTelegramNotifications } from "@/lib/notification-delivery";
import { runPeriodWindowNotifications } from "@/lib/period-notifications";
import { runPeriodLifecycle } from "@/lib/period-lifecycle";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron-доставка уведомлений в Telegram для webhook-развёртывания (Vercel),
 * где нет постоянного процесса бота. Расписание — в vercel.json.
 * Vercel Cron автоматически шлёт заголовок `Authorization: Bearer $CRON_SECRET`.
 * Заодно закрывает истёкшие периоды и открывает следующий по расписанию
 * (runPeriodLifecycle) — ручное управление в admin/periods остаётся доступным.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Автосмена периодов (§2) — до оконных уведомлений: если период только что
  // открылся автоматически, WINDOW_OPEN должен уйти в этом же запуске.
  let lifecycle: { closed: unknown[]; opened: unknown[] } = { closed: [], opened: [] };
  try {
    lifecycle = await runPeriodLifecycle({
      log: (m) => console.log(`[cron/deliver:period] ${m}`),
    });
  } catch (e) {
    console.error("[cron/deliver] автосмена периодов:", e);
  }

  // Оконные уведомления (§5.10) — ставим в очередь, затем доставляем всё разом.
  let windows = { windowOpen: 0, windowClosing: 0 };
  try {
    windows = await runPeriodWindowNotifications();
  } catch (e) {
    console.error("[cron/deliver] оконные уведомления:", e);
  }

  const result = await deliverTelegramNotifications({
    db,
    token: process.env.TELEGRAM_BOT_TOKEN,
    log: (m) => console.log(`[cron/deliver] ${m}`),
  });

  return NextResponse.json({ ok: true, ...result, ...windows, periods: lifecycle });
}
