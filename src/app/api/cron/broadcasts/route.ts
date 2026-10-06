import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { dispatchDueBroadcasts } from "@/lib/broadcast-send";
import { drainTelegramNotifications } from "@/lib/notification-drain";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const DELIVERY_BUDGET_MS = 240_000;

/**
 * Отложенные рассылки (BroadcastCampaign.status = SCHEDULED). Vercel Cron на Hobby —
 * не чаще раза в день, поэтому этот роут дёргает GitHub Actions каждые 5 минут
 * (.github/workflows/scheduled-broadcasts.yml) с `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const log = (m: string) => console.log(`[cron/broadcasts] ${m}`);
  const dispatched = await dispatchDueBroadcasts(log);
  if (dispatched === 0) return NextResponse.json({ ok: true, dispatched });

  const result = await drainTelegramNotifications({
    db,
    token: process.env.TELEGRAM_BOT_TOKEN,
    budgetMs: DELIVERY_BUDGET_MS,
    log,
  });
  return NextResponse.json({ ok: true, dispatched, ...result });
}
