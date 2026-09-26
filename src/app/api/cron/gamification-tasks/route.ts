import { NextResponse, type NextRequest } from "next/server";
import { recomputeAutoTasks } from "@/lib/gamification-tasks";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ежесуточный пересчёт прогресса AUTO-задач геймификации. Расписание — во
 * внешнем планировщике (cron-job.org), не в vercel.json (см. docs/CRON-SETUP.md,
 * Hobby-тариф ограничен 2 задачами раз в сутки).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await recomputeAutoTasks();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/gamification-tasks]", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
