import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";

type Session = Awaited<ReturnType<typeof requireSession>>;

/**
 * Проверка доступа для route handler'ов.
 * Возвращает { session } при успехе либо { response } с 401/403.
 */
export async function apiGuard(
  permission: Permission,
): Promise<{ session: Session; response?: never } | { session?: never; response: NextResponse }> {
  let session: Session;
  try {
    session = await requireSession();
  } catch {
    return { response: NextResponse.json({ error: "Требуется вход." }, { status: 401 }) };
  }
  if (!can(session.roles, permission)) {
    return { response: NextResponse.json({ error: "Недостаточно прав." }, { status: 403 }) };
  }
  return { session };
}
