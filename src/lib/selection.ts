import "server-only";
import { db } from "@/lib/db";
import { ACTIVE_FOR_LIMIT } from "@/lib/application-workflow";

/** Текущий период с открытым окном выбора (ТЗ v2 §5.7). */
export async function getCurrentPeriod() {
  const now = new Date();
  return db.period.findFirst({
    where: { status: "OPEN" },
    orderBy: { startDate: "desc" },
  }).then((p) => {
    if (!p) return null;
    const windowOpen = p.windowStart <= now && p.windowEnd >= now;
    return { ...p, windowOpen };
  });
}

export async function getOrCreateApplication(employeeId: string, periodId: string) {
  return db.application.upsert({
    where: { employeeId_periodId: { employeeId, periodId } },
    update: {},
    create: { employeeId, periodId },
  });
}

export async function getApplicationWithItems(employeeId: string, periodId: string) {
  return db.application.findUnique({
    where: { employeeId_periodId: { employeeId, periodId } },
    include: {
      items: {
        include: { card: { include: { partner: true } }, coupon: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export function countAgainstLimit(items: { status: string }[]) {
  return items.filter((i) => ACTIVE_FOR_LIMIT.includes(i.status as never)).length;
}
