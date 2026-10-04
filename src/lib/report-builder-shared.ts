/**
 * Типы и справочники конструктора отчётов, безопасные для клиентских
 * компонентов — БЕЗ `server-only` и без импорта `db`. Вычисления (запросы к
 * БД, группировка) — в `report-builder.ts`, который реэкспортирует всё отсюда.
 *
 * Одно поле каталога (`FieldMeta`) используется и для группировки, и для
 * условий отчёта: добавить новое поле = одна запись здесь + один accessor в
 * `report-builder.ts`.
 */

export type Dataset = "benefits" | "support" | "coupons";
export type FieldKind = "enum" | "text" | "date";

export type Option = { value: string; label: string };
export type FieldMeta = {
  id: string;
  label: string;
  kind: FieldKind;
  /** Можно ли группировать по полю (по умолчанию да). */
  groupable?: boolean;
  /** Статичные варианты для enum; динамические (период, льгота…) приходят с сервера. */
  options?: Option[];
};

export const DATASET_LABELS: Record<Dataset, string> = {
  benefits: "Льготы",
  support: "Обращения",
  coupons: "Купоны",
};

const ITEM_STATUS_OPTIONS: Option[] = [
  { value: "PENDING", label: "На согласовании" },
  { value: "APPROVED", label: "Одобрено" },
  { value: "REJECTED", label: "Отклонено" },
  { value: "COUPON_CREATED", label: "Купон сформирован" },
  { value: "COUPON_ISSUED", label: "Купон выдан" },
];

const COUPON_STATUS_OPTIONS: Option[] = [
  { value: "CREATED", label: "Сформирован" },
  { value: "ISSUED", label: "Выдан" },
  { value: "USED", label: "Активирован" },
  { value: "EXPIRED", label: "Истёк" },
  { value: "CANCELLED", label: "Отменён" },
];

export const FIELD_CATALOG: Record<Dataset, FieldMeta[]> = {
  benefits: [
    { id: "department", label: "Подразделение", kind: "text" },
    { id: "employee", label: "Сотрудник", kind: "text" },
    { id: "card", label: "Льгота", kind: "text" },
    { id: "partner", label: "Партнёр", kind: "text" },
    { id: "status", label: "Статус позиции", kind: "enum", options: ITEM_STATUS_OPTIONS },
    { id: "period", label: "Период", kind: "enum" },
    { id: "submittedAt", label: "Дата подачи", kind: "date" },
    { id: "decidedAt", label: "Дата решения", kind: "date" },
    { id: "couponStatus", label: "Статус купона", kind: "enum", options: COUPON_STATUS_OPTIONS },
    { id: "issuedAt", label: "Дата выдачи купона", kind: "date" },
    { id: "activatedAt", label: "Дата активации купона", kind: "date" },
  ],
  coupons: [
    { id: "department", label: "Подразделение", kind: "text" },
    { id: "employee", label: "Сотрудник", kind: "text" },
    { id: "card", label: "Льгота", kind: "text" },
    { id: "partner", label: "Партнёр", kind: "text" },
    { id: "couponStatus", label: "Статус купона", kind: "enum", options: COUPON_STATUS_OPTIONS },
    { id: "period", label: "Период", kind: "enum" },
    { id: "createdAt", label: "Дата формирования", kind: "date" },
    { id: "issuedAt", label: "Дата выдачи", kind: "date" },
    { id: "activatedAt", label: "Дата активации", kind: "date" },
    { id: "validUntil", label: "Действует до", kind: "date" },
  ],
  support: [
    { id: "topic", label: "Тема", kind: "enum" },
    {
      id: "source",
      label: "Источник",
      kind: "enum",
      options: [
        { value: "TELEGRAM", label: "Telegram" },
        { value: "WEB", label: "Сайт" },
      ],
    },
    {
      id: "threadStatus",
      label: "Статус",
      kind: "enum",
      options: [
        { value: "OPEN", label: "Открыто" },
        { value: "CLOSED", label: "Закрыто" },
      ],
    },
    { id: "createdAt", label: "Дата обращения", kind: "date" },
  ],
};

/** Главное поле-дата датасета: по нему работают «первая/последняя дата» по умолчанию и серверная предфильтрация. */
export const PRIMARY_DATE: Record<Dataset, string> = {
  benefits: "submittedAt",
  coupons: "issuedAt",
  support: "createdAt",
};

/** Старый id «date» (сохранённые срезы) → главное поле-дата датасета. */
export function canonicalFieldId(dataset: Dataset, id: string): string {
  return id === "date" ? PRIMARY_DATE[dataset] : id;
}

export const fieldMeta = (dataset: Dataset, id: string) => FIELD_CATALOG[dataset].find((f) => f.id === id);

export type DateBucket = "day" | "week" | "month" | "quarter" | "year";
export type AggFn = "count" | "uniqueEmployees" | "share" | "firstDate" | "lastDate";

export const DATE_BUCKET_LABELS: Record<DateBucket, string> = {
  day: "По дням",
  week: "По неделям",
  month: "По месяцам",
  quarter: "По кварталам",
  year: "По годам",
};

export type AggCatalogEntry = { agg: AggFn; label: string };

const COUNT_LABEL: Record<Dataset, string> = {
  benefits: "Количество позиций",
  coupons: "Количество купонов",
  support: "Количество обращений",
};

export const CALC_CATALOG: Record<Dataset, AggCatalogEntry[]> = {
  benefits: aggs("Уникальных сотрудников"),
  coupons: aggs("Уникальных сотрудников"),
  support: aggs("Уникальных обратившихся"),
};

function aggs(uniqueLabel: string): AggCatalogEntry[] {
  return [
    { agg: "count", label: "Количество" },
    { agg: "uniqueEmployees", label: uniqueLabel },
    { agg: "share", label: "Доля от общего, %" },
    { agg: "firstDate", label: "Первая дата" },
    { agg: "lastDate", label: "Последняя дата" },
  ];
}

export function defaultCalcLabel(dataset: Dataset, agg: AggFn, field?: string): string {
  if (agg === "count") return COUNT_LABEL[dataset];
  const base = CALC_CATALOG[dataset].find((c) => c.agg === agg)?.label ?? agg;
  if (agg === "firstDate" || agg === "lastDate") {
    const f = fieldMeta(dataset, field ?? PRIMARY_DATE[dataset]);
    return f ? `${base}: ${f.label.toLowerCase()}` : base;
  }
  return base;
}

export type GroupField = { field: string; bucket?: DateBucket };
export type CalcField = { agg: AggFn; label: string; /** для firstDate/lastDate — поле-дата */ field?: string };

// ---------- Условия ----------

export type Op = "eq" | "ne" | "in" | "contains" | "notContains" | "between" | "gte" | "lte" | "empty" | "notEmpty";

export const OP_LABELS: Record<Op, string> = {
  eq: "равно",
  ne: "не равно",
  in: "одно из",
  contains: "содержит",
  notContains: "не содержит",
  between: "в диапазоне",
  gte: "не раньше",
  lte: "не позже",
  empty: "пусто",
  notEmpty: "заполнено",
};

export const OPS_BY_KIND: Record<FieldKind, Op[]> = {
  enum: ["eq", "ne", "in", "empty", "notEmpty"],
  text: ["contains", "notContains", "eq", "ne", "empty", "notEmpty"],
  date: ["between", "gte", "lte", "eq", "empty", "notEmpty"],
};

export const opNeedsValue = (op: Op) => op !== "empty" && op !== "notEmpty";

/** Значение `period` = «текущий (открытый) период» — подставляется при расчёте, чтобы срез не устаревал. */
export const CURRENT_PERIOD = "@current";

export type Condition = { field: string; op: Op; value?: string; value2?: string };

const ALL_OPS = new Set<string>(Object.keys(OP_LABELS));
const MAX_CONDITIONS = 20;

export function parseConditions(dataset: Dataset, raw: string | null | undefined): Condition[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: Condition[] = [];
    for (const x of arr) {
      if (!x || typeof x.field !== "string" || typeof x.op !== "string" || !ALL_OPS.has(x.op)) continue;
      const meta = fieldMeta(dataset, canonicalFieldId(dataset, x.field));
      if (!meta || !OPS_BY_KIND[meta.kind].includes(x.op as Op)) continue;
      const c: Condition = { field: meta.id, op: x.op as Op };
      if (typeof x.value === "string" && x.value !== "") c.value = x.value.slice(0, 500);
      if (typeof x.value2 === "string" && x.value2 !== "") c.value2 = x.value2.slice(0, 500);
      if (opNeedsValue(c.op) && c.value == null && c.value2 == null) continue;
      out.push(c);
      if (out.length >= MAX_CONDITIONS) break;
    }
    return out;
  } catch {
    return [];
  }
}

// ---------- Конфиг ----------

export type ReportView = "table" | "chart" | "both";

export type BuilderConfig = {
  dataset: Dataset;
  groupFields: GroupField[];
  calcFields: CalcField[];
  conditions: Condition[];
  limit?: number;
  view: ReportView;
  /** Сравнить с предыдущим периодом (нужно условие «Период равно …»). */
  compare: boolean;
};

export type BuilderColumn = { key: string; label: string; numeric: boolean };
export type BuilderResult = {
  columns: BuilderColumn[];
  rows: Record<string, string | number>[];
  totals: Record<string, number> | null;
  matchedCount: number;
};

export type WordFreq = { word: string; count: number };

/** Ключи query/среза. Старые ключи (periodId, status, … dateFrom/dateTo) читаются для совместимости со сохранёнными срезами. */
export const PRESET_CONFIG_KEYS = ["dataset", "g", "c", "f", "limit", "v", "cmp"] as const;
type LegacyFilterKey = "periodId" | "status" | "cardQuery" | "departmentQuery" | "topic" | "source" | "dateFrom" | "dateTo";

export type PresetConfig = Partial<Record<(typeof PRESET_CONFIG_KEYS)[number] | LegacyFilterKey, string>>;

export function parseDataset(raw: string | null | undefined): Dataset {
  return raw === "support" || raw === "coupons" ? raw : "benefits";
}

/** Разбирает JSON из query-параметра `g` — молча отбрасывает всё некорректное (старые/битые срезы). */
export function parseGroupFields(dataset: Dataset, raw: string | null | undefined): GroupField[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: GroupField[] = [];
    for (const x of arr) {
      if (!x || typeof x.field !== "string") continue;
      const meta = fieldMeta(dataset, canonicalFieldId(dataset, x.field));
      if (!meta || meta.groupable === false || out.some((o) => o.field === meta.id)) continue;
      out.push({
        field: meta.id,
        bucket:
          meta.kind === "date"
            ? typeof x.bucket === "string" && x.bucket in DATE_BUCKET_LABELS
              ? (x.bucket as DateBucket)
              : "day"
            : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Разбирает JSON из query-параметра `c`. */
export function parseCalcFields(dataset: Dataset, raw: string | null | undefined): CalcField[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const aggIds = new Set(CALC_CATALOG[dataset].map((a) => a.agg));
    const out: CalcField[] = [];
    for (const x of arr) {
      if (!x || typeof x.agg !== "string" || !aggIds.has(x.agg as AggFn)) continue;
      const agg = x.agg as AggFn;
      let field: string | undefined;
      if (agg === "firstDate" || agg === "lastDate") {
        const meta = typeof x.field === "string" ? fieldMeta(dataset, x.field) : undefined;
        field = meta?.kind === "date" ? meta.id : PRIMARY_DATE[dataset];
      }
      out.push({
        agg,
        field,
        label: typeof x.label === "string" && x.label.trim() ? x.label.trim().slice(0, 80) : defaultCalcLabel(dataset, agg, field),
      });
      if (out.length >= 12) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function defaultGroupFields(dataset: Dataset): GroupField[] {
  return [{ field: dataset === "support" ? "topic" : dataset === "coupons" ? "couponStatus" : "department" }];
}

export function defaultCalcFields(dataset: Dataset): CalcField[] {
  return [{ agg: "count", label: defaultCalcLabel(dataset, "count") }];
}

/** Из старых параметров фильтра (до появления условий) — в условия. */
function legacyConditions(dataset: Dataset, get: (k: string) => string | undefined): Condition[] {
  const out: Condition[] = [];
  const periodId = get("periodId");
  const status = get("status");
  const dateFrom = get("dateFrom");
  const dateTo = get("dateTo");
  if (dataset !== "support" && periodId) out.push({ field: "period", op: "eq", value: periodId });
  if (status) out.push({ field: dataset === "support" ? "threadStatus" : "status", op: "eq", value: status });
  if (dataset === "benefits") {
    if (get("cardQuery")) out.push({ field: "card", op: "contains", value: get("cardQuery") });
    if (get("departmentQuery")) out.push({ field: "department", op: "contains", value: get("departmentQuery") });
  }
  if (dataset === "support") {
    if (get("topic")) out.push({ field: "topic", op: "eq", value: get("topic") });
    if (get("source")) out.push({ field: "source", op: "eq", value: get("source") });
  }
  if (dateFrom || dateTo) {
    out.push({ field: PRIMARY_DATE[dataset], op: "between", value: dateFrom || undefined, value2: dateTo || undefined });
  }
  return out;
}

/** Единый разбор query/среза → `BuilderConfig`: используется страницей, экспортом и рассылкой по расписанию. */
export function configFromParams(get: (key: string) => string | null | undefined): BuilderConfig {
  const g = (k: string) => get(k) ?? undefined;
  const dataset = parseDataset(g("dataset"));
  const groupFields = parseGroupFields(dataset, g("g"));
  const calcFields = parseCalcFields(dataset, g("c"));
  const fRaw = g("f");
  const conditions = fRaw != null ? parseConditions(dataset, fRaw) : legacyConditions(dataset, g);
  const limitN = g("limit") ? Number.parseInt(g("limit")!, 10) : NaN;
  const v = g("v");
  return {
    dataset,
    groupFields: groupFields.length ? groupFields : defaultGroupFields(dataset),
    calcFields: calcFields.length ? calcFields : defaultCalcFields(dataset),
    conditions,
    limit: Number.isFinite(limitN) && limitN > 0 ? Math.min(limitN, 10_000) : undefined,
    view: v === "chart" || v === "both" ? v : "table",
    compare: g("cmp") === "1",
  };
}

/** Обратно — в query-параметры (для ссылок, срезов и экспорта). */
export function configToParams(cfg: BuilderConfig): Record<string, string> {
  const out: Record<string, string> = {
    dataset: cfg.dataset,
    g: JSON.stringify(cfg.groupFields),
    c: JSON.stringify(cfg.calcFields),
    f: JSON.stringify(cfg.conditions),
  };
  if (cfg.limit) out.limit = String(cfg.limit);
  if (cfg.view !== "table") out.v = cfg.view;
  if (cfg.compare) out.cmp = "1";
  return out;
}

/** Человекочитаемое описание условия — для чипов на странице, листа «Условия» в Excel и рассылки. */
export function describeCondition(
  dataset: Dataset,
  c: Condition,
  optionLabel: (field: string, value: string) => string = (_f, v) => v,
): string {
  const meta = fieldMeta(dataset, c.field);
  const label = meta?.label ?? c.field;
  const val = (v?: string) => (v == null ? "…" : meta?.kind === "enum" ? optionLabel(c.field, v) : v);
  switch (c.op) {
    case "between":
      return `${label}: ${c.value ?? "…"} — ${c.value2 ?? "…"}`;
    case "in":
      return `${label}: ${(c.value ?? "").split("|").filter(Boolean).map(val).join(", ")}`;
    case "empty":
    case "notEmpty":
      return `${label} ${OP_LABELS[c.op]}`;
    default:
      return `${label} ${OP_LABELS[c.op]} «${val(c.value)}»`;
  }
}
