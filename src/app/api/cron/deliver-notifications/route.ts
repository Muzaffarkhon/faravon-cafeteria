import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { drainTelegramNotifications } from "@/lib/notification-drain";
import { runNewCardAnnouncements } from "@/lib/card-announcements";
import { runPeriodWindowNotifications } from "@/lib/period-notifications";
import { runPeriodLifecycle, type PeriodLifecycleResult } from "@/lib/period-lifecycle";
import { safeEqual } from "@/lib/timing-safe";
import { dispatchDueBroadcasts } from "@/lib/broadcast-send";
import { issueDueCoupons } from "@/lib/coupon-flow";

export const runtime = "nodejs";
export const maxDuration = 300;
const DELIVERY_BUDGET_MS = 240_000;
export const dynamic = "force-dynamic";

/**
 * Cron-доставка уведомлений в Telegram для webhook-развёртывания (Vercel),
 * где нет постоянного процесса бота. Расписание — в vercel.json.
 * Vercel Cron автоматически шлёт заголовок `Authorization: Bearer $CRON_SECRET`.
 * Заодно закрывает истёкшие периоды, открывает следующий по расписанию и
 * готовит черновик периода после него (runPeriodLifecycle) — ручное
 * управление в admin/periods остаётся доступным.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let lifecycle: PeriodLifecycleResult = { closed: [], opened: [], drafted: null };
  try {
    lifecycle = await runPeriodLifecycle({
      log: (m) => console.log(`[cron/deliver:period] ${m}`),
    });
  } catch (e) {
    console.error("[cron/deliver] автосмена периодов:", e);
  }

  let couponsIssued = 0;
  try {
    couponsIssued = await issueDueCoupons();
  } catch (e) {
    console.error("[cron/deliver] выдача купонов начавшегося периода:", e);
  }

  let windows = { windowOpen: 0, windowClosing: 0 };
  try {
    windows = await runPeriodWindowNotifications();
  } catch (e) {
    console.error("[cron/deliver] оконные уведомления:", e);
  }

  let cards = { cards: 0, queued: 0 };
  try {
    cards = await runNewCardAnnouncements();
  } catch (e) {
    console.error("[cron/deliver] оповещение о новых карточках:", e);
  }

  try {
    await dispatchDueBroadcasts((m) => console.log(`[cron/deliver:broadcast] ${m}`));
  } catch (e) {
    console.error("[cron/deliver] отложенные рассылки:", e);
  }

  const result = await drainTelegramNotifications({
    db,
    token: process.env.TELEGRAM_BOT_TOKEN,
    budgetMs: DELIVERY_BUDGET_MS,
    log: (m) => console.log(`[cron/deliver] ${m}`),
  });

  return NextResponse.json({ ok: true, ...result, ...windows, newCards: cards, periods: lifecycle, couponsIssued });
}
