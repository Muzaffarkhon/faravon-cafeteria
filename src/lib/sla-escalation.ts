/**
 * SLA-эскалации по «зависшим» на согласовании позициям (§5.12).
 * Общий модуль без server-only: вызывается cron-роутом
 * (src/app/api/cron/daily-digest — объединён с ежедневным отчётом из-за
 * лимита в 2 cron-задачи на Vercel Hobby) и может — ботом/скриптом.
 * Prisma-клиент передаётся параметром.
 *
 * Логика: для PENDING-позиции берём самое высокое активное правило, у которого
 * `afterHours` уже прошло от `submittedAt`, а `level` больше текущего
 * `escalationLevel` позиции. Шлём `SLA_ESCALATION` пользователям ролей правила
 * и поднимаем `escalationLevel`. Доставку в Telegram делает вызывающая сторона.
 */
import type { PrismaClient, Role } from "@prisma/client";

export type SlaEscalationResult = { checked: number; escalated: number; notified: number };

export async function runSlaEscalations(opts: {
  db: PrismaClient;
  now?: Date;
  log?: (msg: string) => void;
}): Promise<SlaEscalationResult> {
  const { db, log } = opts;
  const now = opts.now ?? new Date();

  const rules = await db.slaEscalationRule.findMany({
    where: { active: true },
    orderBy: { level: "desc" },
  });
  if (rules.length === 0) {
    log?.("активных правил нет");
    return { checked: 0, escalated: 0, notified: 0 };
  }

  const items = await db.applicationItem.findMany({
    where: { status: "PENDING", submittedAt: { not: null } },
    include: {
      card: { select: { title: true } },
      application: {
        select: { employee: { select: { fullName: true, department: true } } },
      },
    },
  });

  const roleCache = new Map<Role, string[]>();
  async function usersForRole(role: Role): Promise<string[]> {
    const cached = roleCache.get(role);
    if (cached) return cached;
    const us = await db.user.findMany({
      where: { isActive: true, roles: { has: role } },
      select: { id: true },
    });
    const ids = us.map((u) => u.id);
    roleCache.set(role, ids);
    return ids;
  }

  let escalated = 0;
  let notified = 0;

  for (const item of items) {
    const ageHours = (now.getTime() - item.submittedAt!.getTime()) / 3_600_000;
    const rule = rules.find((r) => ageHours >= r.afterHours && r.level > item.escalationLevel);
    if (!rule) continue;

    const targetRoles: Role[] = rule.notifyRoles.length
      ? rule.notifyRoles
      : (["C_AND_B"] as Role[]);
    const userIds = new Set<string>();
    for (const role of targetRoles) {
      for (const id of await usersForRole(role)) userIds.add(id);
    }

    const payload = {
      employee: item.application.employee.fullName,
      department: item.application.employee.department,
      card: item.card.title,
      hours: rule.afterHours,
      level: rule.level,
    };

    // Сначала атомарно поднимаем уровень позиции (условие level > текущего).
    // Если count===0 — параллельный запуск cron уже эскалировал эту позицию
    // либо она вышла из PENDING; уведомления не дублируем.
    const claimed = await db.applicationItem.updateMany({
      where: { id: item.id, status: "PENDING", escalationLevel: { lt: rule.level } },
      data: { escalationLevel: rule.level, lastEscalatedAt: now },
    });
    if (claimed.count === 0) continue;

    if (userIds.size > 0) {
      await db.notification.createMany({
        data: [...userIds].map((userId) => ({
          userId,
          event: "SLA_ESCALATION",
          channel: "TELEGRAM",
          payload,
        })),
      });
      notified += userIds.size;
    } else {
      log?.(`уровень ${rule.level}: нет активных получателей (${targetRoles.join(", ")})`);
    }
    escalated++;
  }

  if (escalated) log?.(`эскалировано позиций: ${escalated}, уведомлений: ${notified}`);
  return { checked: items.length, escalated, notified };
}
