import "server-only";
import { db } from "@/lib/db";
import { businessDaysBetween } from "@/lib/business-days";

const DAY = 24 * 60 * 60 * 1000;
const SLA_DAYS = 5; // §5.12: SLA согласования по умолчанию — 5 рабочих дней

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);

export async function listReportPeriods() {
  return db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, status: true } });
}

export async function computeReport(periodId: string) {
  const period = await db.period.findUnique({ where: { id: periodId } });
  if (!period) return null;

  // Доступ и активация — глобально (§12)
  const [accounts, everLoggedIn] = await Promise.all([
    db.user.count({ where: { roles: { has: "EMPLOYEE" } } }),
    db.user.count({ where: { roles: { has: "EMPLOYEE" }, lastLoginAt: { not: null } } }),
  ]);

  // Только нужные поля — при тысячах заявок это в разы меньше памяти/трафика.
  const apps = await db.application.findMany({
    where: { periodId },
    select: {
      employeeId: true,
      employee: {
        select: { department: true, user: { select: { lastLoginAt: true } } },
      },
      items: {
        select: {
          status: true,
          submittedAt: true,
          decidedAt: true,
          decisionComment: true,
          card: { select: { title: true } },
          coupon: { select: { issuedAt: true } },
        },
      },
    },
  });

  const activeEmployees = apps.length;
  const items = apps.flatMap((a) => a.items);
  const live = items.filter((i) => i.status !== "CANCELLED");
  const hasSelection = (a: (typeof apps)[number]) =>
    a.items.some((i) => i.status !== "CANCELLED");
  const withSelection = apps.filter(hasSelection).length;
  // Вовлечение считаем среди активированных (вошедших) сотрудников —
  // иначе числитель может превысить знаменатель everLoggedIn.
  const engagedLoggedIn = apps.filter(
    (a) => a.employee.user?.lastLoginAt != null && hasSelection(a),
  ).length;

  const submitted = items.filter((i) => i.submittedAt);
  const decided = items.filter((i) => i.decidedAt && ["APPROVED", "COUPON_CREATED", "COUPON_ISSUED", "REJECTED"].includes(i.status));
  const rejected = items.filter((i) => i.status === "REJECTED");
  const issued = items.filter((i) => i.status === "COUPON_ISSUED");

  const nowDate = new Date();
  const decisionTimes = decided
    .filter((i) => i.submittedAt && i.decidedAt)
    .map((i) => (i.decidedAt!.getTime() - i.submittedAt!.getTime()) / DAY);
  const issueTimes = items
    .filter((i) => i.coupon?.issuedAt && i.decidedAt)
    .map((i) => (i.coupon!.issuedAt!.getTime() - i.decidedAt!.getTime()) / DAY);

  // §5.12: SLA считаем в РАБОЧИХ днях
  const slaBreached =
    decided.filter(
      (i) =>
        i.submittedAt &&
        i.decidedAt &&
        businessDaysBetween(i.submittedAt, i.decidedAt) > SLA_DAYS,
    ).length +
    submitted.filter(
      (i) =>
        i.status === "PENDING" && businessDaysBetween(i.submittedAt!, nowDate) > SLA_DAYS,
    ).length;

  // Топ льгот
  const bySelections = new Map<string, number>();
  const byApprovals = new Map<string, number>();
  for (const i of live) {
    bySelections.set(i.card.title, (bySelections.get(i.card.title) ?? 0) + 1);
    if (["APPROVED", "COUPON_CREATED", "COUPON_ISSUED"].includes(i.status)) {
      byApprovals.set(i.card.title, (byApprovals.get(i.card.title) ?? 0) + 1);
    }
  }
  const topSelections = [...bySelections.entries()].map(([title, n]) => ({ title, n })).sort((a, b) => b.n - a.n);
  const topApprovals = [...byApprovals.entries()].map(([title, n]) => ({ title, n })).sort((a, b) => b.n - a.n);

  // Отклонения по причинам
  const reasons = new Map<string, number>();
  for (const i of rejected) {
    const key = i.decisionComment?.trim() || "(без указания причины)";
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const rejectionsByReason = [...reasons.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n);

  // По подразделениям
  const dept = new Map<string, { employees: Set<string>; items: number }>();
  for (const a of apps) {
    const d = dept.get(a.employee.department) ?? { employees: new Set(), items: 0 };
    d.employees.add(a.employeeId);
    d.items += a.items.filter((i) => i.status !== "CANCELLED").length;
    dept.set(a.employee.department, d);
  }
  const byDepartment = [...dept.entries()]
    .map(([department, v]) => ({ department, employees: v.employees.size, items: v.items }))
    .sort((a, b) => b.items - a.items);

  // Динамика подачи заявок по дням периода — для линейного графика.
  const byDay = new Map<string, number>();
  for (const i of submitted) {
    const day = i.submittedAt!.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const dailySubmissions = [...byDay.entries()]
    .map(([day, n]) => ({ day, n }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    period,
    kpis: {
      accounts,
      everLoggedIn,
      activationPct: pct(everLoggedIn, accounts),
      activeEmployees,
      withSelection,
      engagedLoggedIn,
      engagementPct: pct(engagedLoggedIn, everLoggedIn),
      avgSelectionsPerActive: activeEmployees ? live.length / activeEmployees : null,
      submitted: submitted.length,
      issued: issued.length,
      conversionPct: pct(issued.length, submitted.length),
      decided: decided.length,
      rejected: rejected.length,
      rejectionPct: pct(rejected.length, decided.length),
      avgDecisionDays: avg(decisionTimes),
      p90DecisionDays: percentile(decisionTimes, 90),
      avgIssueDays: avg(issueTimes),
      p90IssueDays: percentile(issueTimes, 90),
      slaBreached,
      slaBreachPct: pct(slaBreached, submitted.length),
    },
    topSelections,
    topApprovals,
    rejectionsByReason,
    byDepartment,
    dailySubmissions,
  };
}

export type Report = NonNullable<Awaited<ReturnType<typeof computeReport>>>;
