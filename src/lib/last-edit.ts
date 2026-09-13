import "server-only";
import { db } from "@/lib/db";

export type LastEdit = { at: Date; by: string };

/**
 * Кто и когда последний раз менял запись — колонка «Последнее изменение» в
 * административных списках (§9). Дата берётся из аудита (не `updatedAt` самой
 * записи): для создания это тот же момент, для правок — точнее совпадает с
 * тем, что реально видно в журнале аудита ниже.
 */
export async function lastEditsFor(
  entityType: string,
  ids: string[],
): Promise<Map<string, LastEdit>> {
  if (ids.length === 0) return new Map();

  const rows = await db.auditLog.findMany({
    where: { entityType, entityId: { in: ids } },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      entityId: true,
      createdAt: true,
      actor: { select: { login: true, employee: { select: { fullName: true } } } },
    },
  });

  const map = new Map<string, LastEdit>();
  for (const r of rows) {
    if (!r.entityId || map.has(r.entityId)) continue;
    map.set(r.entityId, {
      at: r.createdAt,
      by: r.actor?.employee?.fullName ?? r.actor?.login ?? "—",
    });
  }
  return map;
}

/** Форматирует «Последнее изменение» одной строкой для ячейки таблицы. */
export function formatLastEdit(e: LastEdit | undefined, fallbackAt: Date): string {
  const at = e?.at ?? fallbackAt;
  const when = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(at);
  return e ? `${when} · ${e.by}` : when;
}
