import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Счётчик непрочитанных сообщений в чате поддержки — опрашивается клиентом
 * (`_support-alert.tsx`) обычным `fetch` раз в POLL_MS, даже на скрытой
 * вкладке. В отличие от общего SSE (`/api/stream`), который намеренно рвёт
 * соединение при потере фокуса (экономит время функции на Vercel), здесь
 * важен обратный случай — узнать именно когда пользователь ушёл на другую
 * вкладку. Короткий поллинг раз в 20 с не держит функцию открытой, поэтому
 * этого компромисса не требует.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !can(session.roles, "support.manage")) {
    return NextResponse.json({ count: 0 });
  }
  const count = await db.supportThread.count({
    where: { messages: { some: { direction: "IN", readAt: null } } },
  });
  return NextResponse.json({ count });
}
