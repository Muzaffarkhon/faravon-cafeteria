import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { dushanbeDateKey, fmtDateTimeShort } from "@/lib/dushanbe-date";
import {
  configFromParams,
  describeCondition,
  runBuilderReportCompared,
  type PresetConfig,
} from "@/lib/report-builder";

const MAX_ROWS = 20;

/** День недели по Душанбе, 1–7 (пн–вс). */
export function dushanbeWeekday(now = new Date()): number {
  const d = new Date(now.getTime() + 5 * 3_600_000).getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * Рассылка срезов по расписанию: вызывается ежедневным cron (≈09:00 по
 * Душанбе). Текст — простой (шаблон сам экранирует значения). Каждому подписчику — текст отчёта через очередь уведомлений
 * (доставляет deliver-notifications). Идемпотентно в рамках суток (dedupeKey).
 */
export async function runReportSchedules(now = new Date()): Promise<{ queued: number; skipped: number }> {
  const today = dushanbeDateKey(now);
  const weekday = dushanbeWeekday(now);
  const schedules = await db.reportSchedule.findMany({
    where: { OR: [{ weekday: null }, { weekday }] },
    include: { preset: true, user: { select: { id: true, roles: true, isActive: true } } },
  });

  let queued = 0;
  let skipped = 0;
  for (const s of schedules) {
    const already = s.lastSentAt && dushanbeDateKey(s.lastSentAt) === today;
    if (already || !s.user.isActive || !can(s.user.roles, "reports.view")) {
      skipped++;
      continue;
    }
    const cfg = configFromParams((k) => (s.preset.config as PresetConfig)[k as keyof PresetConfig]);
    const { result, compareNote } = await runBuilderReportCompared(cfg);
    const nGroups = cfg.groupFields.length;

    const lines = [
      `${s.preset.name} · ${fmtDateTimeShort(now)}`,
      ...(cfg.conditions.length
        ? [`Условия: ${cfg.conditions.map((c) => describeCondition(cfg.dataset, c)).join("; ")}`]
        : []),
      ...(compareNote ? [compareNote] : []),
      `Записей: ${result.matchedCount}`,
      "",
      ...result.rows.slice(0, MAX_ROWS).map((r) => {
        const head = result.columns.slice(0, nGroups).map((c) => r[c.key]).join(" · ");
        const vals = result.columns.slice(nGroups).map((c) => r[c.key]).join(" / ");
        return `${head}: ${vals}`;
      }),
      ...(result.rows.length > MAX_ROWS ? [`… и ещё ${result.rows.length - MAX_ROWS} строк(и) — полный отчёт на сайте`] : []),
    ];

    try {
      await db.notification.create({
        data: {
          userId: s.userId,
          event: "DAILY_DIGEST",
          channel: "TELEGRAM",
          payload: { text: lines.join("\n") },
          dedupeKey: `report-schedule:${s.id}:${today}`,
        },
      });
      await db.reportSchedule.update({ where: { id: s.id }, data: { lastSentAt: now } });
      queued++;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        skipped++;
        continue;
      }
      throw e;
    }
  }
  return { queued, skipped };
}

