import "server-only";
import { db } from "@/lib/db";
import type { ItemStatus } from "@prisma/client";

/**
 * Конструктор сводных отчётов (§ «Отчёты»): группировка выбранных льгот
 * (ApplicationItem — ядро домена: заявка → позиция → льгота/партнёр/статус)
 * по произвольному измерению с агрегацией количества, плюс топ-N и период.
 * Данные считаются в памяти (тот же приём, что и `computeReport` в
 * `reports.ts`) — датасет одного периода умещается без проблем.
 */

export type PivotDimension = "department" | "card" | "partner" | "status" | "period" | "day";
export type PivotMeasure = "count" | "employees";

export const DIMENSION_LABELS: Record<PivotDimension, string> = {
  department: "Подразделение",
  card: "Льгота",
  partner: "Партнёр",
  status: "Статус",
  period: "Период",
  day: "День подачи",
};

export const MEASURE_LABELS: Record<PivotMeasure, string> = {
  count: "Количество позиций",
  employees: "Уникальных сотрудников",
};

export type PivotConfig = {
  dimension: PivotDimension;
  measure: PivotMeasure;
  periodId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: ItemStatus;
  cardQuery?: string;
  departmentQuery?: string;
  topN?: number;
};

export type PivotRow = { label: string; value: number };

export async function listPeriodsForBuilder() {
  return db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } });
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  DRAFT: "Черновик",
  PENDING: "На согласовании",
  APPROVED: "Одобрено",
  REJECTED: "Отклонено",
  COUPON_CREATED: "Купон сформирован",
  COUPON_ISSUED: "Купон выдан",
  CANCELLED: "Отменено",
};

export async function runPivotReport(cfg: PivotConfig): Promise<{ rows: PivotRow[]; total: number }> {
  const items = await db.applicationItem.findMany({
    where: {
      status: cfg.status ? cfg.status : { not: "CANCELLED" },
      application: {
        periodId: cfg.periodId || undefined,
        employee: cfg.departmentQuery
          ? { department: { contains: cfg.departmentQuery, mode: "insensitive" } }
          : undefined,
      },
      submittedAt:
        cfg.dateFrom || cfg.dateTo
          ? {
              gte: cfg.dateFrom ? new Date(cfg.dateFrom) : undefined,
              lte: cfg.dateTo ? new Date(new Date(cfg.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined,
            }
          : undefined,
      card: cfg.cardQuery ? { title: { contains: cfg.cardQuery, mode: "insensitive" } } : undefined,
    },
    select: {
      status: true,
      submittedAt: true,
      application: {
        select: {
          employeeId: true,
          period: { select: { id: true, name: true } },
          employee: { select: { department: true } },
        },
      },
      card: { select: { title: true, partner: { select: { name: true } } } },
    },
  });

  const groups = new Map<string, { count: number; employees: Set<string> }>();
  for (const i of items) {
    let key: string;
    switch (cfg.dimension) {
      case "department":
        key = i.application.employee.department || "(без подразделения)";
        break;
      case "card":
        key = i.card.title;
        break;
      case "partner":
        key = i.card.partner?.name ?? "(без партнёра)";
        break;
      case "status":
        key = STATUS_LABELS[i.status];
        break;
      case "period":
        key = i.application.period.name;
        break;
      case "day":
        key = i.submittedAt ? i.submittedAt.toISOString().slice(0, 10) : "(не подано)";
        break;
      default:
        key = "—";
    }
    const g = groups.get(key) ?? { count: 0, employees: new Set() };
    g.count += 1;
    g.employees.add(i.application.employeeId);
    groups.set(key, g);
  }

  let rows: PivotRow[] = [...groups.entries()]
    .map(([label, g]) => ({ label, value: cfg.measure === "employees" ? g.employees.size : g.count }))
    .sort((a, b) => b.value - a.value);

  if (cfg.dimension === "day") rows = rows.sort((a, b) => a.label.localeCompare(b.label));
  if (cfg.topN && cfg.topN > 0 && cfg.dimension !== "day") rows = rows.slice(0, cfg.topN);

  const total = rows.reduce((s, r) => s + r.value, 0);
  return { rows, total };
}
