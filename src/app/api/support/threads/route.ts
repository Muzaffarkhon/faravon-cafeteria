import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fetchThreadRows } from "@/app/(admin)/admin/support/_thread-list-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Список диалогов поддержки для клиентской боковой панели
 * (`_thread-list-live.tsx`) — та же выборка, что раньше рендерилась на
 * сервере внутри `page.tsx`/`[id]/page.tsx`, но теперь панель живёт в общем
 * layout и сама опрашивает список, поэтому переход между диалогами не
 * перемонтирует её (нет «перезагрузки» при выборе чата).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (!can(session.roles, "support.manage") && !can(session.roles, "feedback.manage"))) {
    return NextResponse.json({ rows: [] }, { status: 403 });
  }
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { rows } = await fetchThreadRows(sp);
  return NextResponse.json({ rows });
}
