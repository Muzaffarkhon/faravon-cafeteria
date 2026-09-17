/**
 * Типы и справочники конструктора отчётов, безопасные для клиентских
 * компонентов (`_fields-editor.tsx`, `_filter-modal.tsx`) — БЕЗ `server-only`
 * и без импорта `db`. Сами вычисления (запросы к БД, группировка) — в
 * `report-builder.ts`, который реэкспортирует всё отсюда для серверных
 * потребителей (`page.tsx`, `export/route.ts`).
 */

export type Dataset = "benefits" | "support";

export type GroupFieldId =
  // benefits
  | "department"
  | "card"
  | "partner"
  | "status"
  | "period"
  | "date"
  // support (переиспользует "date")
  | "topic"
  | "source"
  | "threadStatus";

export type DateBucket = "day" | "week" | "month" | "quarter" | "year";
export type AggFn = "count" | "uniqueEmployees" | "firstDate" | "lastDate";

export type FieldCatalogEntry = { id: GroupFieldId; label: string };
export type AggCatalogEntry = { agg: AggFn; label: string };

export const DATASET_LABELS: Record<Dataset, string> = {
  benefits: "Льготы",
  support: "Обращения",
};

export const GROUP_CATALOG: Record<Dataset, FieldCatalogEntry[]> = {
  benefits: [
    { id: "department", label: "Подразделение" },
    { id: "card", label: "Льгота" },
    { id: "partner", label: "Партнёр" },
    { id: "status", label: "Статус" },
    { id: "period", label: "Период" },
    { id: "date", label: "Дата подачи" },
  ],
  support: [
    { id: "topic", label: "Тема" },
    { id: "source", label: "Источник" },
    { id: "threadStatus", label: "Статус" },
    { id: "date", label: "Дата обращения" },
  ],
};

export const CALC_CATALOG: Record<Dataset, AggCatalogEntry[]> = {
  benefits: [
    { agg: "count", label: "Количество позиций" },
    { agg: "uniqueEmployees", label: "Уникальных сотрудников" },
    { agg: "firstDate", label: "Первая дата подачи" },
    { agg: "lastDate", label: "Последняя дата подачи" },
  ],
  support: [
    { agg: "count", label: "Количество обращений" },
    { agg: "uniqueEmployees", label: "Уникальных обратившихся" },
    { agg: "firstDate", label: "Первое обращение" },
    { agg: "lastDate", label: "Последнее обращение" },
  ],
};

export const DATE_BUCKET_LABELS: Record<DateBucket, string> = {
  day: "По дням",
  week: "По неделям",
  month: "По месяцам",
  quarter: "По кварталам",
  year: "По годам",
};

/** Все известные id полей группировки (обоих датасетов) — для валидации сохранённых конфигураций. */
const ALL_GROUP_FIELD_IDS = new Set<GroupFieldId>([
  ...GROUP_CATALOG.benefits.map((f) => f.id),
  ...GROUP_CATALOG.support.map((f) => f.id),
]);
const ALL_AGG_FNS = new Set<AggFn>(["count", "uniqueEmployees", "firstDate", "lastDate"]);

export type GroupField = { field: GroupFieldId; bucket?: DateBucket };
export type CalcField = { agg: AggFn; label: string };

export type BuilderConfig = {
  dataset: Dataset;
  groupFields: GroupField[];
  calcFields: CalcField[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  // benefits
  periodId?: string;
  status?: string;
  cardQuery?: string;
  departmentQuery?: string;
  // support
  topic?: string;
  source?: string;
};

export type BuilderColumn = { key: string; label: string; numeric: boolean };
export type BuilderResult = {
  columns: BuilderColumn[];
  rows: Record<string, string | number>[];
  totals: Record<string, number> | null;
  matchedCount: number;
};

export type WordFreq = { word: string; count: number };

/** Ключи, которые сохраняются в срезе (ReportPreset.config) — держим в одном месте с builder/page.tsx и builder/actions.ts. */
export const PRESET_CONFIG_KEYS = [
  "dataset",
  "g",
  "c",
  "periodId",
  "dateFrom",
  "dateTo",
  "status",
  "cardQuery",
  "departmentQuery",
  "topic",
  "source",
  "limit",
] as const;

export type PresetConfig = Partial<Record<(typeof PRESET_CONFIG_KEYS)[number], string>>;

export function parseDataset(raw: string | null | undefined): Dataset {
  return raw === "support" ? "support" : "benefits";
}

/** Разбирает JSON из query-параметра `g` — молча отбрасывает всё некорректное (старые/битые пресеты, поля не того датасета отфильтровываются позже в runBuilderReport). */
export function parseGroupFields(raw: string | null | undefined): GroupField[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is { field: string; bucket?: string } => !!x && typeof x.field === "string" && ALL_GROUP_FIELD_IDS.has(x.field as GroupFieldId))
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
      .filter((x): x is { agg: string; label?: string } => !!x && typeof x.agg === "string" && ALL_AGG_FNS.has(x.agg as AggFn))
      .map((x) => ({
        agg: x.agg as AggFn,
        label: typeof x.label === "string" && x.label.trim() ? x.label.trim() : (x.agg as AggFn),
      }));
  } catch {
    return [];
  }
}
