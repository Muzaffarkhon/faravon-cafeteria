import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type ReviewItemRow = {
  itemId: string;
  card: string;
  partner: string | null;
  condition: string | null;
  submittedLabel: string | null;
  waiting: string | null;
  overdue: boolean;
};

export type ReviewGroup = {
  key: string;
  employee: string;
  department: string;
  period: string;
  items: ReviewItemRow[];
};

export type ReviewQueue = {
  groups: ReviewGroup[];
  shown: number;
  overdueCount: number;
  periods: { id: string; name: string }[];
};

export type ReviewQuery = { q: string; periodId: string; sort: "old" | "new" };

const fmtDate = (d: Date) => d.toLocaleDateString("ru-RU");

/** «ждёт 5 ч» / «ждёт 3 дн.» — длительность ожидания решения. */
function waitingLabel(submittedAt: Date | null, now: number): string | null {
  if (!submittedAt) return null;
  const hours = Math.max(0, Math.round((now - submittedAt.getTime()) / 3_600_000));
  return hours < 24 ? `ждёт ${hours} ч` : `ждёт ${Math.floor(hours / 24)} дн.`;
}

/**
 * Очередь согласования с фильтрами/поиском/сортировкой и индикацией
 * просрочки по SLA (§5.12). Time-based вычисления — вне компонента,
 * чтобы не нарушать чистоту рендера (react-hooks/purity).
 */
export async function buildReviewQueue({ q, periodId, sort }: ReviewQuery): Promise<ReviewQueue> {
  const search: Prisma.ApplicationItemWhereInput | undefined = q
    ? {
        OR: [
          { application: { employee: { fullName: { contains: q, mode: "insensitive" } } } },
          { application: { employee: { department: { contains: q, mode: "insensitive" } } } },
          { card: { title: { contains: q, mode: "insensitive" } } },
        ],
      }
    : undefined;
  const periodFilter: Prisma.ApplicationItemWhereInput | undefined = periodId
    ? { application: { periodId } }
    : undefined;

  const [pending, periods, slaRules] = await Promise.all([
    db.applicationItem.findMany({
      where: {
        status: "PENDING",
        ...(search ?? {}),
        ...(periodFilter ?? {}),
      },
      include: {
        card: { include: { partner: true } },
        application: { include: { employee: true, period: true } },
      },
      orderBy: { submittedAt: sort === "new" ? "desc" : "asc" },
    }),
    db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    // Порог SLA — самое раннее активное правило эскалации.
    db.slaEscalationRule.findMany({
      where: { active: true },
      orderBy: { afterHours: "asc" },
      select: { afterHours: true },
    }),
  ]);

  const slaHours = slaRules[0]?.afterHours ?? null;
  const now = Date.now();
  const isOverdue = (submittedAt: Date | null) =>
    slaHours != null && !!submittedAt && now - submittedAt.getTime() > slaHours * 3_600_000;

  // группировка по сотруднику + период
  const groups = new Map<string, ReviewGroup>();
  for (const item of pending) {
    const key = `${item.application.employeeId}:${item.application.periodId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        employee: item.application.employee.fullName,
        department: item.application.employee.department,
        period: item.application.period.name,
        items: [],
      };
      groups.set(key, g);
    }
    g.items.push({
      itemId: item.id,
      card: item.card.title,
      partner: item.card.partner?.name ?? null,
      condition: item.card.condition,
      submittedLabel: item.submittedAt ? fmtDate(item.submittedAt) : null,
      waiting: waitingLabel(item.submittedAt, now),
      overdue: isOverdue(item.submittedAt),
    });
  }

  return {
    groups: [...groups.values()],
    shown: pending.length,
    overdueCount: pending.filter((i) => isOverdue(i.submittedAt)).length,
    periods,
  };
}
