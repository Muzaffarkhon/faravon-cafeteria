import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Пинг-эндпоинт для внешнего мониторинга (UptimeRobot и т.п.).
// Выполняет запрос к БД, поэтому держит Neon «тёплым» (scale-to-zero).
// force-dynamic — чтобы Next не отдавал статически закешированный ответ.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, db: "up", latencyMs: Date.now() - startedAt, at: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, db: "down", latencyMs: Date.now() - startedAt, at: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
