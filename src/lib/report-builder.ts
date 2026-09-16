import "server-only";
import { db } from "@/lib/db";
import type { ItemStatus } from "@prisma/client";

/**
 * Конструктор сводных отчётов (§ «Отчёты»): группировка выбранных льгот
 * (ApplicationItem — ядро домена: заявка → позиция → льгота/партнёр/статус)
 * по произвольному измерению с агрегацией количества, плюс топ-N и период.
 * Опционально — второе измерение по колонкам (как сводная таблица в Excel):
 * тогда вместе с плоским списком `rows` считается ещё и `matrix`. Данные
 * считаются в памяти (тот же приём, что и `computeReport` в `reports.ts`) —
 * датасет одного периода умещается без проблем.
 */

export type PivotDimension = "department" | "card" | "partner" | "status" | "period" | "day" | "month";
export type PivotMeasure = "count" | "employees";

export const DIMENSION_LABELS: Record<PivotDimension, string> = {
  department: "Подразделение",
  card: "Льгота",
  partner: "Партнёр",
  status: "Статус",
  period: "Период",
  day: "День подачи",
  month: "Месяц подачи",
};

export const MEASURE_LABELS: Record<PivotMeasure, string> = {
  count: "Количество позиций",
  employees: "Уникальных сотрудников",
};

export type PivotConfig = {
  dimension: PivotDimension;
  /** Второе измерение — раскладывает те же данные по колонкам, как в сводной таблице Excel. */
  columnDimension?: PivotDimension;
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

export type PivotMatrix = {
  rowLabels: string[];
  columnLabels: string[];
  /** cells[i][j] — значение на пересечении rowLabels[i] × columnLabels[j]. */
  cells: number[][];
  rowTotals: number[];
  columnTotals: number[];
  grandTotal: number;
};

/** Именно эти ключи конструктора сохраняются в срезе (ReportPreset.config) — держим в одном месте с builder/page.tsx и builder/actions.ts. */
export const PRESET_CONFIG_KEYS = [
  "dimension",
  "columnDimension",
  "measure",
  "periodId",
  "dateFrom",
  "dateTo",
  "status",
  "cardQuery",
  "departmentQuery",
  "topN",
] as const;

export type PresetConfig = Partial<Record<(typeof PRESET_CONFIG_KEYS)[number], string>>;

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

type ItemForDimension = {
  status: ItemStatus;
  submittedAt: Date | null;
  application: {
    employeeId: string;
    period: { id: string; name: string };
    employee: { department: string | null };
  };
  card: { title: string; partner: { name: string } | null };
};

/** Значение измерения для одной позиции — общее для строк и колонок. */
function dimensionKey(i: ItemForDimension, dimension: PivotDimension): string {
  switch (dimension) {
    case "department":
      return i.application.employee.department || "(без подразделения)";
    case "card":
      return i.card.title;
    case "partner":
      return i.card.partner?.name ?? "(без партнёра)";
    case "status":
      return STATUS_LABELS[i.status];
    case "period":
      return i.application.period.name;
    case "day":
      return i.submittedAt ? i.submittedAt.toISOString().slice(0, 10) : "(не подано)";
    case "month":
      return i.submittedAt ? i.submittedAt.toISOString().slice(0, 7) : "(не подано)";
    default:
      return "—";
  }
}

/** Измерения по времени сортируются хронологически, остальные — по убыванию значения. */
const isChronological = (d: PivotDimension) => d === "day" || d === "month";

export async function runPivotReport(
  cfg: PivotConfig,
): Promise<{ rows: PivotRow[]; total: number; matrix: PivotMatrix | null }> {
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
    const key = dimensionKey(i, cfg.dimension);
    const g = groups.get(key) ?? { count: 0, employees: new Set() };
    g.count += 1;
    g.employees.add(i.application.employeeId);
    groups.set(key, g);
  }

  let rows: PivotRow[] = [...groups.entries()]
    .map(([label, g]) => ({ label, value: cfg.measure === "employees" ? g.employees.size : g.count }))
    .sort((a, b) => b.value - a.value);

  if (isChronological(cfg.dimension)) rows = rows.sort((a, b) => a.label.localeCompare(b.label));
  if (cfg.topN && cfg.topN > 0 && !isChronological(cfg.dimension)) rows = rows.slice(0, cfg.topN);

  const total = rows.reduce((s, r) => s + r.value, 0);

  let matrix: PivotMatrix | null = null;
  if (cfg.columnDimension && cfg.columnDimension !== cfg.dimension) {
    const columnDimension = cfg.columnDimension;
    // Ограничиваем строки итоговым (уже отсортированным и, возможно, топ-N)
    // набором меток — то же подмножество, что видно в плоском списке, а не
    // весь неограниченный срез: иначе топ-N в шапке и в матрице бы расходились.
    const rowLabels = rows.map((r) => r.label);
    const rowIndex = new Map(rowLabels.map((l, idx) => [l, idx]));
    const colGroups = new Map<string, { count: number; employees: Set<string> }>();
    // Строка -> колонка -> агрегат: вложенные Map вместо составного строкового
    // ключа, чтобы метки измерений (название льготы, подразделения и т.п.)
    // могли содержать любые символы без риска коллизии с разделителем.
    const cellGroups = new Map<string, Map<string, { count: number; employees: Set<string> }>>();

    for (const i of items) {
      const rk = dimensionKey(i, cfg.dimension);
      if (!rowIndex.has(rk)) continue; // отсечено топ-N по строкам
      const ck = dimensionKey(i, columnDimension);

      const cg = colGroups.get(ck) ?? { count: 0, employees: new Set() };
      cg.count += 1;
      cg.employees.add(i.application.employeeId);
      colGroups.set(ck, cg);

      const rowCells = cellGroups.get(rk) ?? new Map<string, { count: number; employees: Set<string> }>();
      const cc = rowCells.get(ck) ?? { count: 0, employees: new Set() };
      cc.count += 1;
      cc.employees.add(i.application.employeeId);
      rowCells.set(ck, cc);
      cellGroups.set(rk, rowCells);
    }

    let columnLabels = [...colGroups.keys()];
    columnLabels = isChronological(columnDimension)
      ? columnLabels.sort((a, b) => a.localeCompare(b))
      : columnLabels.sort(
          (a, b) =>
            (cfg.measure === "employees" ? colGroups.get(b)!.employees.size : colGroups.get(b)!.count) -
            (cfg.measure === "employees" ? colGroups.get(a)!.employees.size : colGroups.get(a)!.count),
        );

    const cellValue = (rk: string, ck: string) => {
      const c = cellGroups.get(rk)?.get(ck);
      if (!c) return 0;
      return cfg.measure === "employees" ? c.employees.size : c.count;
    };

    const cells = rowLabels.map((rl) => columnLabels.map((cl) => cellValue(rl, cl)));
    const rowTotals = rows.map((r) => r.value);
    const columnTotals = columnLabels.map((cl) =>
      cfg.measure === "employees" ? colGroups.get(cl)!.employees.size : colGroups.get(cl)!.count,
    );
    // Грандтотал — не сумма ячеек (для measure="employees" один и тот же
    // сотрудник может попасть в несколько ячеек и посчитался бы дважды), а
    // те же уникальные сотрудники/позиции, что и total по строкам.
    const grandTotal = total;

    matrix = { rowLabels, columnLabels, cells, rowTotals, columnTotals, grandTotal };
  }

  return { rows, total, matrix };
}
