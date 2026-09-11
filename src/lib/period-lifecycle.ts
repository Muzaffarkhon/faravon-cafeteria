import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { carryUnfilledGroupSelections } from "@/lib/group-rollover";

export type PeriodLifecycleResult = {
  closed: { id: string; name: string }[];
  opened: { id: string; name: string }[];
};

/**
 * Автоматическая смена периодов (§2): раз в день —
 * 1. закрываем OPEN-период, у которого истёк `endDate` (перенос не набравших
 *    порог групповых льгот — как при ручном закрытии, см. admin/periods/actions.ts);
 * 2. если после этого нет ни одного OPEN-периода, открываем следующий
 *    DRAFT-период, чей `windowStart` уже наступил.
 * Ручное управление (кнопки «Открыть»/«Закрыть»/редактирование дат в
 * admin/periods) остаётся доступным и приоритетным — крон лишь избавляет
 * от необходимости щёлкать это вручную каждый месяц.
 */
export async function runPeriodLifecycle(opts: {
  now?: Date;
  actorId?: string | null;
  log?: (msg: string) => void;
}): Promise<PeriodLifecycleResult> {
  const now = opts.now ?? new Date();
  const log = opts.log;
  const result: PeriodLifecycleResult = { closed: [], opened: [] };

  const toClose = await db.period.findMany({
    where: { status: "OPEN", endDate: { lt: now } },
  });

  for (const p of toClose) {
    const claim = await db.period.updateMany({
      where: { id: p.id, status: "OPEN" },
      data: { status: "CLOSED" },
    });
    if (claim.count === 0) continue; // уже закрыт (гонка с ручным действием)

    await audit({
      actorId: opts.actorId ?? null,
      action: "PERIOD_CLOSED",
      entityType: "Period",
      entityId: p.id,
      oldValue: { status: "OPEN" },
      newValue: { status: "CLOSED", auto: true },
    });

    try {
      const carry = await carryUnfilledGroupSelections(p.id, opts.actorId ?? null);
      log?.(`период «${p.name}» закрыт автоматически, перенос групповых льгот: ${JSON.stringify(carry)}`);
    } catch (e) {
      log?.(`период «${p.name}» закрыт, но перенос групповых льгот упал: ${e instanceof Error ? e.message : e}`);
    }

    result.closed.push({ id: p.id, name: p.name });
  }

  // Открываем следующий период, только если сейчас нет ни одного открытого
  // (то же ограничение, что и у ручного действия — один открытый период за раз).
  const stillOpen = await db.period.findFirst({ where: { status: "OPEN" } });
  if (!stillOpen) {
    const next = await db.period.findFirst({
      where: { status: "DRAFT", windowStart: { lte: now } },
      orderBy: { startDate: "asc" },
    });
    if (next) {
      const claim = await db.period.updateMany({
        where: { id: next.id, status: "DRAFT" },
        data: { status: "OPEN" },
      });
      if (claim.count === 1) {
        await audit({
          actorId: opts.actorId ?? null,
          action: "PERIOD_OPENED",
          entityType: "Period",
          entityId: next.id,
          oldValue: { status: "DRAFT" },
          newValue: { status: "OPEN", auto: true },
        });
        log?.(`период «${next.name}» открыт автоматически`);
        result.opened.push({ id: next.id, name: next.name });
      }
    }
  }

  return result;
}
