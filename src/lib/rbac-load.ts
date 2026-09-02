import "server-only";
import { db } from "@/lib/db";
import { setRbacMatrix } from "./rbac";

// Матрица прав живёт в модульном кеше (общий на воркер). Обновляем из БД не
// чаще раза в TTL — при правке на /admin/access вызывается ensureRbac(true).
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
    /* БД недоступна — не трогаем кеш */
  }
}
