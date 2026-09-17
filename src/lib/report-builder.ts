import "server-only";
import { db } from "@/lib/db";
import type { ItemStatus } from "@prisma/client";

/**
 * Конструктор сводных отчётов (§ «Отчёты»): произвольный набор полей
 * группировки (каждое — своя колонка результата, дата — с выбором
 * периодичности разбивки) + произвольный набор вычисляемых полей
 * (агрегатная функция на каждое) поверх ApplicationItem — ядра домена
 * (заявка → позиция → льгота/партнёр/статус). Данные считаются в памяти
 * (тот же приём, что и `computeReport` в `reports.ts`) — датасет одного
 * периода умещается без проблем.
 */

export type GroupFieldId = "department" | "card" | "partner" | "status" | "period" | "date";
export type DateBucket = "day" | "week" | "month" | "quarter" | "year";
export type AggFn = "count" | "uniqueEmployees" | "firstDate" | "lastDate";

export const GROUP_FIELD_LABELS: Record<GroupFieldId, string> = {
  department: "Подразделение",
  card: "Льгота",
  partner: "Партнёр",
  status: "Статус",
  period: "Период",
  date: "Дата подачи",
};

export const DATE_BUCKET_LABELS: Record<DateBucket, string> = {
  day: "По дням",
  week: "По неделям",
  month: "По месяцам",
  quarter: "По кварталам",
  year: "По годам",
};

export const AGG_FN_LABELS: Record<AggFn, string> = {
  count: "Количество позиций",
  uniqueEmployees: "Уникальных сотрудников",
  firstDate: "Первая дата подачи",
  lastDate: "Последняя дата подачи",
};

export type GroupField = { field: GroupFieldId; bucket?: DateBucket };
export type CalcField = { agg: AggFn; label: string };

export type BuilderConfig = {
  groupFields: GroupField[];
  calcFields: CalcField[];
  periodId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: ItemStatus;
  cardQuery?: string;
  departmentQuery?: string;
  limit?: number;
};

export type BuilderColumn = { key: string; label: string; numeric: boolean };
export type BuilderResult = {
  columns: BuilderColumn[];
  rows: Record<string, string | number>[];
  totals: Record<string, number> | null;
  matchedCount: number;
};

/** Ключи, которые сохраняются в срезе (ReportPreset.config) — держим в одном месте с builder/page.tsx и builder/actions.ts. */
export const PRESET_CONFIG_KEYS = [
  "g",
  "c",
  "periodId",
  "dateFrom",
  "dateTo",
  "status",
  "cardQuery",
  "departmentQuery",
  "limit",
] as const;

export type PresetConfig = Partial<Record<(typeof PRESET_CONFIG_KEYS)[number], string>>;

/** Разбирает JSON из query-параметра `g` — молча отбрасывает всё некорректное (старые/битые пресеты). */
export function parseGroupFields(raw: string | null | undefined): GroupField[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is { field: string; bucket?: string } => !!x && typeof x.field === "string" && x.field in GROUP_FIELD_LABELS)
      .map((x) => ({
        field: x.field as GroupFieldId,
        bucket: x.field === "date" && typeof x.bucket === "string" && x.bucket in DATE_BUCKET_LABELS ? (x.bucket as DateBucket) : undefined,
      }));
  } catch {
    return [];
  }
}

/** Разбирает JSON из query-параметра `c` — молча отбрасывает всё некорректное (старые/битые пресеты). */
export function parseCalcFields(raw: string | null | undefined): CalcField[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is { agg: string; label?: string } => !!x && typeof x.agg === "string" && x.agg in AGG_FN_LABELS)
      .map((x) => ({
        agg: x.agg as AggFn,
        label: typeof x.label === "string" && x.label.trim() ? x.label.trim() : AGG_FN_LABELS[x.agg as AggFn],
      }));
  } catch {
    return [];
  }
}

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

type ItemForGroup = {
  status: ItemStatus;
  submittedAt: Date | null;
  application: {
    employeeId: string;
    period: { id: string; name: string };
    employee: { department: string | null };
  };
  card: { title: string; partner: { name: string } | null };
};

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // понедельник = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const weekNum =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/** Ключ бакета даты — специально в ISO-подобном формате: сортируется как строка в хронологическом порядке. */
function dateBucketKey(d: Date, bucket: DateBucket): string {
  switch (bucket) {
    case "day":
      return d.toISOString().slice(0, 10);
    case "week":
      return isoWeekKey(d);
    case "month":
      return d.toISOString().slice(0, 7);
    case "quarter":
      return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    case "year":
      return String(d.getUTCFullYear());
  }
}

/** Значение поля группировки для одной позиции. */
function groupValue(i: ItemForGroup, gf: GroupField): string {
  switch (gf.field) {
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
    case "date":
      return i.submittedAt ? dateBucketKey(i.submittedAt, gf.bucket ?? "day") : "(не подано)";
  }
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" });

type Agg = { count: number; employees: Set<string>; minDate: Date | null; maxDate: Date | null };

function newAgg(): Agg {
  return { count: 0, employees: new Set(), minDate: null, maxDate: null };
}

function feedAgg(a: Agg, i: ItemForGroup) {
  a.count += 1;
  a.employees.add(i.application.employeeId);
  if (i.submittedAt) {
    if (!a.minDate || i.submittedAt < a.minDate) a.minDate = i.submittedAt;
    if (!a.maxDate || i.submittedAt > a.maxDate) a.maxDate = i.submittedAt;
  }
}

function aggValue(a: Agg, fn: AggFn): string | number {
  switch (fn) {
    case "count":
      return a.count;
    case "uniqueEmployees":
      return a.employees.size;
    case "firstDate":
      return a.minDate ? dateFormatter.format(a.minDate) : "—";
    case "lastDate":
      return a.maxDate ? dateFormatter.format(a.maxDate) : "—";
  }
}

const isNumericAgg = (fn: AggFn) => fn === "count" || fn === "uniqueEmployees";

export async function runBuilderReport(cfg: BuilderConfig): Promise<BuilderResult> {
  const groupFields = cfg.groupFields.length ? cfg.groupFields : [{ field: "department" as const }];
  const calcFields = cfg.calcFields.length ? cfg.calcFields : [{ agg: "count" as const, label: AGG_FN_LABELS.count }];

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

  const groups = new Map<string, { values: string[]; agg: Agg }>();
  for (const i of items) {
    const values = groupFields.map((gf) => groupValue(i, gf));
    const key = values.join("");
    const g = groups.get(key) ?? { values, agg: newAgg() };
    feedAgg(g.agg, i);
    groups.set(key, g);
  }

  const dateFirst = groupFields[0]?.field === "date";
  let entries = [...groups.values()];
  if (dateFirst) {
    entries.sort((a, b) => a.values.join("").localeCompare(b.values.join("")));
  } else {
    const firstFn = calcFields[0].agg;
    entries.sort((a, b) => {
      const av = aggValue(a.agg, firstFn);
      const bv = aggValue(b.agg, firstFn);
      if (typeof av === "number" && typeof bv === "number") return bv - av;
      return a.values.join("").localeCompare(b.values.join(""));
    });
  }
  if (cfg.limit && cfg.limit > 0) entries = entries.slice(0, cfg.limit);

  const columns: BuilderColumn[] = [
    ...groupFields.map((gf, i) => ({
      key: `g${i}`,
      label: GROUP_FIELD_LABELS[gf.field] + (gf.field === "date" && gf.bucket ? ` (${DATE_BUCKET_LABELS[gf.bucket]})` : ""),
      numeric: false,
    })),
    ...calcFields.map((cf, i) => ({ key: `c${i}`, label: cf.label, numeric: isNumericAgg(cf.agg) })),
  ];

  const rows = entries.map((e) => {
    const row: Record<string, string | number> = {};
    e.values.forEach((v, i) => (row[`g${i}`] = v));
    calcFields.forEach((cf, i) => (row[`c${i}`] = aggValue(e.agg, cf.agg)));
    return row;
  });

  const totals: Record<string, number> = {};
  calcFields.forEach((cf, i) => {
    if (!isNumericAgg(cf.agg)) return;
    totals[`c${i}`] = rows.reduce((s, r) => s + (r[`c${i}`] as number), 0);
  });

  return { columns, rows, totals: Object.keys(totals).length ? totals : null, matchedCount: items.length };
}
