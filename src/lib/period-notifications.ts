import "server-only";
import { db } from "@/lib/db";

const DAY = 24 * 60 * 60 * 1000;
const CLOSING_LEAD_DAYS = 3; // §5.10: напоминание за 3 дня до конца окна

const fmt = (d: Date) => d.toLocaleDateString("ru-RU");

/**
 * Оконные уведомления (§5.10): «окно выбора открыто» — всем сотрудникам в день
 * открытия; «закроется через 3 дня» — тем, кто ещё не выбрал ни одной льготы.
 * Идемпотентно: пометки windowOpenNotifiedAt / windowClosingNotifiedAt на периоде.
 * Вызывается из cron-доставки, поэтому отдельный планировщик не нужен.
 */
export async function runPeriodWindowNotifications(): Promise<{
  windowOpen: number;
  windowClosing: number;
}> {
  const now = new Date();
  let windowOpen = 0;
  let windowClosing = 0;

  const periods = await db.period.findMany({
    where: {
      status: "OPEN",
      OR: [{ windowOpenNotifiedAt: null }, { windowClosingNotifiedAt: null }],
    },
  });

  for (const p of periods) {
    // --- «окно открыто» — всем сотрудникам с учётной записью ---
    if (!p.windowOpenNotifiedAt && p.windowStart <= now && p.windowEnd > now) {
      // Сначала атомарно «забираем» период (флаг ставится ДО рассылки). Если
      // count===0 — параллельный запуск cron уже занялся этим, выходим.
      const claim = await db.period.updateMany({
        where: { id: p.id, windowOpenNotifiedAt: null },
        data: { windowOpenNotifiedAt: now },
      });
      if (claim.count === 1) {
        const users = await db.user.findMany({
          where: { isActive: true, employee: { isActive: true } },
          select: { id: true },
        });
        if (users.length) {
          await db.notification.createMany({
            data: users.map((u) => ({
              userId: u.id,
              event: "WINDOW_OPEN",
              channel: "TELEGRAM",
              payload: { period: p.name, windowEnd: fmt(p.windowEnd) },
            })),
          });
          windowOpen += users.length;
        }
      }
    }

    // --- «закроется через 3 дня» — сотрудникам без выбора ---
    const leadStart = new Date(p.windowEnd.getTime() - CLOSING_LEAD_DAYS * DAY);
    if (!p.windowClosingNotifiedAt && now >= leadStart && now < p.windowEnd) {
      const claimClosing = await db.period.updateMany({
        where: { id: p.id, windowClosingNotifiedAt: null },
        data: { windowClosingNotifiedAt: now },
      });
      if (claimClosing.count === 0) continue; // параллельный запуск уже занялся
      const chosen = await db.application.findMany({
        where: {
          periodId: p.id,
          items: { some: { status: { notIn: ["CANCELLED", "REJECTED"] } } },
        },
        select: { employeeId: true },
      });
      const chosenIds = new Set(chosen.map((a) => a.employeeId));
      const users = await db.user.findMany({
        where: { isActive: true, employee: { isActive: true } },
        select: { id: true, employeeId: true },
      });
      const targets = users.filter((u) => u.employeeId && !chosenIds.has(u.employeeId));
      if (targets.length) {
        await db.notification.createMany({
          data: targets.map((u) => ({
            userId: u.id,
            event: "WINDOW_CLOSING",
            channel: "TELEGRAM",
            payload: { period: p.name, windowEnd: fmt(p.windowEnd) },
          })),
        });
        windowClosing += targets.length;
      }
    }
  }

  return { windowOpen, windowClosing };
}
