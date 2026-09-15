/**
 * Общий движок «умного фильтра» (см. `components/smart-filter.tsx`).
 * Значения фильтра хранятся в query-параметрах вида `sf_<key>` (оператор),
 * `sf_<key>_v` (значение) и `sf_<key>_v2` (второе значение для диапазона) —
 * так фильтр переживает перезагрузку и им можно поделиться ссылкой, без
 * клиентского состояния на сервере.
 */

export type TextOp = "contains" | "startsWith" | "endsWith" | "equals" | "notContains";
export type NumOp = "eq" | "gt" | "lt" | "gte" | "lte" | "range";
export type FilterOp = TextOp | NumOp;

export type FilterValue = { op: FilterOp; v?: string; v2?: string };

export type SmartFilterFieldType = "text" | "number" | "date" | "select";

export type SmartFilterField = {
  key: string;
  label: string;
  type: SmartFilterFieldType;
  options?: { value: string; label: string }[];
};

export const TEXT_OPS: { value: TextOp; label: string }[] = [
  { value: "contains", label: "содержит" },
  { value: "startsWith", label: "начинается с" },
  { value: "endsWith", label: "заканчивается на" },
  { value: "equals", label: "точно равно" },
  { value: "notContains", label: "не содержит" },
];

export const NUM_OPS: { value: NumOp; label: string }[] = [
  { value: "eq", label: "= равно" },
  { value: "gt", label: "> больше" },
  { value: "lt", label: "< меньше" },
  { value: "gte", label: ">= больше или равно" },
  { value: "lte", label: "<= меньше или равно" },
  { value: "range", label: "Диапазон (от..до)" },
];

/** Разбирает query-параметры страницы в карту `key -> FilterValue`. */
export function parseSmartFilterParams(
  sp: Record<string, string | undefined>,
  fields: SmartFilterField[],
): Record<string, FilterValue> {
  const out: Record<string, FilterValue> = {};
  for (const f of fields) {
    const op = sp[`sf_${f.key}`] as FilterOp | undefined;
    const v = sp[`sf_${f.key}_v`];
    const v2 = sp[`sf_${f.key}_v2`];
    if (!op || (!v && op !== "range") || (op === "range" && !v && !v2)) continue;
    out[f.key] = { op, v, v2 };
  }
  return out;
}

/** Строит Prisma `StringFilter`-совместимый объект из значения текстового поля. */
export function stringFilter(fv?: FilterValue): Record<string, unknown> | undefined {
  if (!fv?.v) return undefined;
  switch (fv.op as TextOp) {
    case "contains":
      return { contains: fv.v, mode: "insensitive" };
    case "startsWith":
      return { startsWith: fv.v, mode: "insensitive" };
    case "endsWith":
      return { endsWith: fv.v, mode: "insensitive" };
    case "equals":
      return { equals: fv.v, mode: "insensitive" };
    case "notContains":
      return { not: { contains: fv.v, mode: "insensitive" } };
    default:
      return undefined;
  }
}

/** Строит Prisma `IntFilter`/`FloatFilter`-совместимый объект из числового значения. */
export function numberFilter(fv?: FilterValue): Record<string, unknown> | undefined {
  if (!fv) return undefined;
  const n = (s?: string) => (s != null && s !== "" ? Number(s) : undefined);
  const a = n(fv.v);
  const b = n(fv.v2);
  switch (fv.op as NumOp) {
    case "eq":
      return a != null ? { equals: a } : undefined;
    case "gt":
      return a != null ? { gt: a } : undefined;
    case "lt":
      return a != null ? { lt: a } : undefined;
    case "gte":
      return a != null ? { gte: a } : undefined;
    case "lte":
      return a != null ? { lte: a } : undefined;
    case "range":
      if (a != null && b != null) return { gte: Math.min(a, b), lte: Math.max(a, b) };
      if (a != null) return { gte: a };
      if (b != null) return { lte: b };
      return undefined;
    default:
      return undefined;
  }
}

/** Строит Prisma `DateTimeFilter`-совместимый объект из даты (yyyy-mm-dd). */
export function dateFilter(fv?: FilterValue): Record<string, unknown> | undefined {
  if (!fv) return undefined;
  const d = (s?: string) => (s ? new Date(s) : undefined);
  const endOfDay = (date: Date) => new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
  const a = d(fv.v);
  const b = d(fv.v2);
  switch (fv.op as NumOp) {
    case "eq":
      return a ? { gte: a, lte: endOfDay(a) } : undefined;
    case "gt":
      return a ? { gt: endOfDay(a) } : undefined;
    case "lt":
      return a ? { lt: a } : undefined;
    case "gte":
      return a ? { gte: a } : undefined;
    case "lte":
      return a ? { lte: endOfDay(a) } : undefined;
    case "range":
      if (a && b) return { gte: a, lte: endOfDay(b) };
      if (a) return { gte: a };
      if (b) return { lte: endOfDay(b) };
      return undefined;
    default:
      return undefined;
  }
}

/** Значение select-поля: сравнение на равенство/неравенство. */
export function selectFilter(fv?: FilterValue): { equals?: string; not?: string } | undefined {
  if (!fv?.v) return undefined;
  return fv.op === "notContains" ? { not: fv.v } : { equals: fv.v };
}
