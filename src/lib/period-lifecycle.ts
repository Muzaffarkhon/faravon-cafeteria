import "server-only";
import type { Period } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { carryUnfilledGroupSelections } from "@/lib/group-rollover";
import { dushanbeInstant, dushanbeYM } from "@/lib/selection";

export type PeriodLifecycleResult = {
  closed: { id: string; name: string }[];
  opened: { id: string; name: string }[];
  drafted: { id: string; name: string } | null;
};

const MONTH_NAMES_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/**
 * Шаблон следующего периода по образцу `after` (обычно только что открытый
 * период): следующий календарный месяц, окно выбора — с 20-го числа месяца
 * `after` по 2 дня до старта нового периода (как уже сложилось у C&B вручную:
 * см. периоды «Октябрь»/«Ноябрь» 2026). Лимит выбора — как у `after`.
 */
function nextPeriodTemplate(after: Pick<Period, "startDate" | "maxSelections">) {
  const { y, m } = dushanbeYM(after.startDate); // месяц периода `after`
  const ny = m === 11 ? y + 1 : y;
  const nm = (m + 1) % 12; // месяц нового периода

  const startDate = dushanbeInstant(ny, nm, 1);
  const endDate = new Date(dushanbeInstant(ny, nm + 1, 1).getTime() - 1); // конец последнего дня
  const windowStart = dushanbeInstant(y, m, 20);
  const windowEnd = new Date(startDate.getTime() - 2 * 24 * 60 * 60 * 1000 - 1);

  return {
    name: `${MONTH_NAMES_RU[nm]} ${ny}`,
    startDate,
    endDate,
    windowStart,
    windowEnd,
    maxSelections: after.maxSelections,
  };
}

/**
 * Гарантирует, что на месяц после `after` уже есть черновик периода — чтобы
 * C&B не нужно было каждый месяц создавать период руками, только проверить/
 * поправить даты при нестандартном месяце. Идемпотентно: если период,
 * стартующий в этом календарном месяце, уже существует (в любом статусе) —
 * ничего не делает.
 */
export async function ensureNextPeriodDraft(
  after: Pick<Period, "startDate" | "maxSelections">,
  actorId?: string | null,
): Promise<{ id: string; name: string } | null> {
  const tpl = nextPeriodTemplate(after);

  const { y, m } = dushanbeYM(tpl.startDate);
  const monthStart = dushanbeInstant(y, m, 1);
  const monthEnd = dushanbeInstant(y, m + 1, 1);
  const exists = await db.period.findFirst({
    where: { startDate: { gte: monthStart, lt: monthEnd } },
  });
  if (exists) return null;

  const created = await db.period.create({ data: { ...tpl, status: "DRAFT" } });
  await audit({
    actorId: actorId ?? null,
    action: "PERIOD_CREATED",
    entityType: "Period",
    entityId: created.id,
    newValue: { name: created.name, auto: true },
  });
  return { id: created.id, name: created.name };
}

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
  const result: PeriodLifecycleResult = { closed: [], opened: [], drafted: null };

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

        try {
          const drafted = await ensureNextPeriodDraft(next, opts.actorId ?? null);
          if (drafted) {
            log?.(`черновик следующего периода создан автоматически: «${drafted.name}»`);
            result.drafted = drafted;
          }
        } catch (e) {
          log?.(`не удалось создать черновик следующего периода: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }

  return result;
}
