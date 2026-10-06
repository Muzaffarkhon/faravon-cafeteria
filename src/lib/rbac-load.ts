import "server-only";
import { db } from "@/lib/db";
import { setRbacMatrix } from "./rbac";

let loadedAt = 0;
const TTL_MS = 30_000;

/**
 * Подтянуть матрицу прав из таблицы `RolePermission`. Вызывается в начале
 * рендера защищённого layout, чтобы `can()` дальше по дереву видел свежие
 * данные. Ошибку БД глотаем — остаётся текущая матрица (в худшем случае —
 * значения по умолчанию из кода).
 */
export async function ensureRbac(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  try {
    const rows = await db.rolePermission.findMany({
      select: { role: true, permission: true, allowed: true },
    });
    setRbacMatrix(rows);
    loadedAt = Date.now();
  } catch {
  }
}
