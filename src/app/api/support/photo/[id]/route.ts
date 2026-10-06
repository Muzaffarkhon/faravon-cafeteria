import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fetchTelegramFile } from "@/lib/support-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Фото из Telegram-диалога для админки: файл остаётся в боте, у нас лежит только file_id —
 * подтягиваем картинку из Telegram по запросу, токен бота при этом не уходит в браузер.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (!can(session.roles, "support.manage") && !can(session.roles, "feedback.manage"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const m = await db.supportMessage.findUnique({ where: { id }, select: { tgFileId: true } });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!m?.tgFileId || !token) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const file = await fetchTelegramFile(token, m.tgFileId);
  if (!file) return NextResponse.json({ error: "telegram_unavailable" }, { status: 502 });
  return new NextResponse(file.body, {
    headers: {
      "content-type": file.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
