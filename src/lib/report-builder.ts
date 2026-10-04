import "server-only";
import { db } from "@/lib/db";
import {
  CURRENT_PERIOD,
  DATE_BUCKET_LABELS,
  PRIMARY_DATE,
  fieldMeta,
  type AggFn,
  type BuilderColumn,
  type BuilderConfig,
  type BuilderResult,
  type CalcField,
  type Condition,
  type DateBucket,
  type Dataset,
  type GroupField,
  type Option,
  type WordFreq,
} from "@/lib/report-builder-shared";
import { dushanbeDayRange, dushanbeIsoDate, fmtDate } from "@/lib/dushanbe-date";

/**
 * Конструктор сводных отчётов: произвольные поля группировки (дата — с
 * разбивкой день/неделя/месяц/квартал/год), произвольные вычисляемые поля и
 * произвольные УСЛОВИЯ (`Condition`: поле + оператор + значение) поверх одного
 * из датасетов — «Льготы», «Купоны», «Обращения».
 *
 * Каждый датасет описан набором accessor'ов по полям каталога
 * (`FIELD_CATALOG`): одни и те же accessor'ы работают для группировки и для
 * условий. Строки грузятся из БД с предфильтром по периоду и главной дате
 * (чтобы не тянуть всё), остальные условия применяются в памяти.
 *
 * Типы и справочники без БД — в `report-builder-shared.ts` (этот файл
 * `server-only`, в клиентские компоненты его импортировать нельзя).
 */
export * from "@/lib/report-builder-shared";

export async function listPeriodsForBuilder() {
  return db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, status: true } });
}

/** Динамические варианты для enum/text-полей (период, льгота, партнёр, подразделение, тема) — для редактора условий. */
export async function listReportOptions(dataset: Dataset): Promise<Record<string, Option[]>> {
  if (dataset === "support") {
    const topics = await db.supportThread.findMany({ where: { topic: { not: null } }, distinct: ["topic"], select: { topic: true } });
    return { topic: topics.map((t) => ({ value: t.topic!, label: t.topic! })) };
  }
  const [periods, cards, partners, depts] = await Promise.all([
    listPeriodsForBuilder(),
    db.benefitCard.findMany({ orderBy: { title: "asc" }, select: { title: true } }),
    db.partner.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    db.employee.findMany({ distinct: ["department"], orderBy: { department: "asc" }, select: { department: true } }),
  ]);
  return {
    period: [{ value: CURRENT_PERIOD, label: "Текущий (открытый) период" }, ...periods.map((p) => ({ value: p.id, label: p.name }))],
    card: cards.map((c) => ({ value: c.title, label: c.title })),
    partner: partners.map((p) => ({ value: p.name, label: p.name })),
    department: depts.filter((d) => d.department).map((d) => ({ value: d.department, label: d.department })),
  };
}

// ---------- Даты и бакеты ----------

/** Сдвиг на UTC+5: UTC-геттеры результата дают календарные поля по Душанбе. */
const toDushanbe = (d: Date) => new Date(d.getTime() + 5 * 3_600_000);

function isoWeekKey(local: Date): string {
  const date = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
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

/** Ключ бакета даты — ISO-подобный: сортируется как строка в хронологическом порядке. */
function dateBucketKey(utc: Date, bucket: DateBucket): string {
  const d = toDushanbe(utc);
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

// ---------- Датасеты ----------

const ITEM_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  PENDING: "На согласовании",
  APPROVED: "Одобрено",
  REJECTED: "Отклонено",
  COUPON_CREATED: "Купон сформирован",
  COUPON_ISSUED: "Купон выдан",
  CANCELLED: "Отменено",
};

type Accessor<R> = {
  /** Сырое значение для условий: enum — код, text — строка, date — yyyy-mm-dd по Душанбе. */
  raw: (r: R) => string | null;
  /** Подпись для группировки (по умолчанию — подпись из каталога или сырое значение). */
  display?: (r: R) => string;
  date?: (r: R) => Date | null;
};

type DatasetDef<R> = {
  accessors: Record<string, Accessor<R>>;
  /** Купон строки активирован (есть дата активации или статус «Активирован»). Нет — датасет без купонов. */
  isActivated?: (r: R) => boolean;
  identity: (r: R) => string;
  load: (conds: Condition[]) => Promise<R[]>;
};

const dateAcc = <R,>(get: (r: R) => Date | null): Accessor<R> => ({
  raw: (r) => {
    const d = get(r);
    return d ? dushanbeIsoDate(d) : null;
  },
  date: get,
});

const firstCond = (conds: Condition[], field: string, ops: Condition["op"][]) =>
  conds.find((c) => c.field === field && ops.includes(c.op));

/** Предфильтр по главной дате: между/не раньше/не позже → диапазон в SQL (условие всё равно перепроверяется в памяти). */
function primaryDateRange(dataset: Dataset, conds: Condition[]) {
  const c = firstCond(conds, PRIMARY_DATE[dataset], ["between", "gte", "lte"]);
  if (!c) return undefined;
  if (c.op === "between") return dushanbeDayRange(c.value, c.value2);
  if (c.op === "gte") return dushanbeDayRange(c.value, undefined);
  return dushanbeDayRange(undefined, c.value);
}

const periodEq = (conds: Condition[]) => firstCond(conds, "period", ["eq"])?.value;

type BenefitRow = {
  status: string;
  submittedAt: Date | null;
  decidedAt: Date | null;
  application: {
    employeeId: string;
    period: { id: string; name: string };
    employee: { department: string | null; fullName: string };
  };
  card: { title: string; partner: { name: string } | null };
  coupon: { status: string; issuedAt: Date | null; activatedAt: Date | null } | null;
};

const benefits: DatasetDef<BenefitRow> = {
  accessors: {
    department: { raw: (r) => r.application.employee.department || null, display: (r) => r.application.employee.department || "(без подразделения)" },
    employee: { raw: (r) => r.application.employee.fullName },
    card: { raw: (r) => r.card.title },
    partner: { raw: (r) => r.card.partner?.name ?? null, display: (r) => r.card.partner?.name ?? "(без партнёра)" },
    status: { raw: (r) => r.status, display: (r) => ITEM_STATUS_LABELS[r.status] ?? r.status },
    period: { raw: (r) => r.application.period.id, display: (r) => r.application.period.name },
    submittedAt: dateAcc((r) => r.submittedAt),
    decidedAt: dateAcc((r) => r.decidedAt),
    couponStatus: { raw: (r) => r.coupon?.status ?? null, display: (r) => (r.coupon ? couponStatusLabel(r.coupon.status) : "(нет купона)") },
    issuedAt: dateAcc((r) => r.coupon?.issuedAt ?? null),
    activatedAt: dateAcc((r) => r.coupon?.activatedAt ?? null),
  },
  identity: (r) => r.application.employeeId,
  isActivated: (r) => !!r.coupon && (!!r.coupon.activatedAt || r.coupon.status === "USED"),
  load: (conds) =>
    db.applicationItem.findMany({
      where: {
        // Отменённые скрыты, пока явно не задано условие по статусу.
        status: conds.some((c) => c.field === "status") ? undefined : { not: "CANCELLED" },
        application: { periodId: periodEq(conds) && periodEq(conds) !== CURRENT_PERIOD ? periodEq(conds) : undefined },
        submittedAt: primaryDateRange("benefits", conds),
      },
      select: {
        status: true,
        submittedAt: true,
        decidedAt: true,
        application: {
          select: {
            employeeId: true,
            period: { select: { id: true, name: true } },
            employee: { select: { department: true, fullName: true } },
          },
        },
        card: { select: { title: true, partner: { select: { name: true } } } },
        coupon: { select: { status: true, issuedAt: true, activatedAt: true } },
      },
    }) as unknown as Promise<BenefitRow[]>,
};

const COUPON_STATUS_LABELS: Record<string, string> = {
  CREATED: "Сформирован",
  ISSUED: "Выдан",
  USED: "Активирован",
  EXPIRED: "Истёк",
  CANCELLED: "Отменён",
};
const couponStatusLabel = (s: string) => COUPON_STATUS_LABELS[s] ?? s;

type CouponRow = {
  status: string;
  createdAt: Date;
  issuedAt: Date | null;
  activatedAt: Date | null;
  validUntil: Date | null;
  employeeId: string;
  employee: { department: string | null; fullName: string };
  period: { id: string; name: string };
  item: { card: { title: string } };
  partner: { name: string } | null;
};

const coupons: DatasetDef<CouponRow> = {
  accessors: {
    department: { raw: (r) => r.employee.department || null, display: (r) => r.employee.department || "(без подразделения)" },
    employee: { raw: (r) => r.employee.fullName },
    card: { raw: (r) => r.item.card.title },
    partner: { raw: (r) => r.partner?.name ?? null, display: (r) => r.partner?.name ?? "(без партнёра)" },
    couponStatus: { raw: (r) => r.status, display: (r) => couponStatusLabel(r.status) },
    period: { raw: (r) => r.period.id, display: (r) => r.period.name },
    createdAt: dateAcc((r) => r.createdAt),
    issuedAt: dateAcc((r) => r.issuedAt),
    activatedAt: dateAcc((r) => r.activatedAt),
    validUntil: dateAcc((r) => r.validUntil),
  },
  identity: (r) => r.employeeId,
  isActivated: (r) => !!r.activatedAt || r.status === "USED",
  load: (conds) =>
    db.coupon.findMany({
      where: {
        periodId: periodEq(conds) && periodEq(conds) !== CURRENT_PERIOD ? periodEq(conds) : undefined,
        issuedAt: primaryDateRange("coupons", conds),
      },
      select: {
        status: true,
        createdAt: true,
        issuedAt: true,
        activatedAt: true,
        validUntil: true,
        employeeId: true,
        employee: { select: { department: true, fullName: true } },
        period: { select: { id: true, name: true } },
        item: { select: { card: { select: { title: true } } } },
        partner: { select: { name: true } },
      },
    }) as unknown as Promise<CouponRow[]>,
};

type SupportRow = {
  id: string;
  topic: string | null;
  source: string;
  status: string;
  createdAt: Date;
  employeeId: string | null;
  telegramId: string | null;
  phone: string | null;
};

const SOURCE_LABELS: Record<string, string> = { TELEGRAM: "Telegram", WEB: "Сайт" };
const THREAD_STATUS_LABELS: Record<string, string> = { OPEN: "Открыто", CLOSED: "Закрыто" };

/** Идентификатор «кто обратился»: сотрудник, иначе гость по chat id/телефону, иначе сама заявка. */
const supportIdentity = (t: SupportRow) =>
  t.employeeId ?? (t.telegramId ? `tg:${t.telegramId}` : null) ?? (t.phone ? `phone:${t.phone}` : null) ?? `thread:${t.id}`;

const support: DatasetDef<SupportRow> = {
  accessors: {
    topic: { raw: (r) => r.topic || null, display: (r) => r.topic || "(без темы)" },
    source: { raw: (r) => r.source, display: (r) => SOURCE_LABELS[r.source] ?? r.source },
    threadStatus: { raw: (r) => r.status, display: (r) => THREAD_STATUS_LABELS[r.status] ?? r.status },
    createdAt: dateAcc((r) => r.createdAt),
  },
  identity: supportIdentity,
  load: (conds) =>
    db.supportThread.findMany({
      where: { archivedAt: null, createdAt: primaryDateRange("support", conds) },
      select: { id: true, topic: true, source: true, status: true, createdAt: true, employeeId: true, telegramId: true, phone: true },
    }) as unknown as Promise<SupportRow[]>,
};

const DATASETS = { benefits, coupons, support } as unknown as Record<Dataset, DatasetDef<unknown>>;

// ---------- Условия ----------

function matchesCondition(raw: string | null, kind: "enum" | "text" | "date", c: Condition): boolean {
  const v = c.value ?? "";
  const lc = (s: string) => s.toLowerCase();
  switch (c.op) {
    case "empty":
      return raw == null || raw === "";
    case "notEmpty":
      return raw != null && raw !== "";
    case "eq":
      return raw != null && (kind === "text" ? lc(raw) === lc(v) : raw === v);
    case "ne":
      return !(raw != null && (kind === "text" ? lc(raw) === lc(v) : raw === v));
    case "in":
      return raw != null && v.split("|").includes(raw);
    case "contains":
      return raw != null && lc(raw).includes(lc(v));
    case "notContains":
      return raw == null || !lc(raw).includes(lc(v));
    case "between":
      return raw != null && (!c.value || raw >= c.value) && (!c.value2 || raw <= c.value2);
    case "gte":
      return raw != null && raw >= v;
    case "lte":
      return raw != null && raw <= v;
  }
}

/** «Текущий период» → id открытого (или самого свежего) периода. */
async function resolveConditions(conds: Condition[]): Promise<Condition[]> {
  if (!conds.some((c) => c.field === "period" && c.value?.includes(CURRENT_PERIOD))) return conds;
  const p =
    (await db.period.findFirst({ where: { status: "OPEN" }, orderBy: { startDate: "desc" }, select: { id: true } })) ??
    (await db.period.findFirst({ orderBy: { startDate: "desc" }, select: { id: true } }));
  const id = p?.id ?? "";
  return conds.map((c) =>
    c.field === "period" && c.value ? { ...c, value: c.value.split("|").map((x) => (x === CURRENT_PERIOD ? id : x)).join("|") } : c,
  );
}

function applyConditions<R>(def: DatasetDef<R>, dataset: Dataset, rows: R[], conds: Condition[]): R[] {
  if (conds.length === 0) return rows;
  const checks = conds.flatMap((c) => {
    const acc = def.accessors[c.field];
    const meta = fieldMeta(dataset, c.field);
    return acc && meta ? [{ acc, kind: meta.kind, c }] : [];
  });
  return rows.filter((r) => checks.every(({ acc, kind, c }) => matchesCondition(acc.raw(r), kind, c)));
}

// ---------- Агрегаты ----------

type Agg = { count: number; activated: number; identities: Set<string>; mins: Map<string, Date>; maxs: Map<string, Date> };

const newAgg = (): Agg => ({ count: 0, activated: 0, identities: new Set(), mins: new Map(), maxs: new Map() });

function feedAgg<R>(a: Agg, row: R, def: DatasetDef<R>, dateFields: string[]) {
  a.count += 1;
  if (def.isActivated?.(row)) a.activated += 1;
  a.identities.add(def.identity(row));
  for (const f of dateFields) {
    const d = def.accessors[f]?.date?.(row);
    if (!d) continue;
    const mn = a.mins.get(f);
    const mx = a.maxs.get(f);
    if (!mn || d < mn) a.mins.set(f, d);
    if (!mx || d > mx) a.maxs.set(f, d);
  }
}

const isSummable = (fn: AggFn) => fn === "count" || fn === "uniqueEmployees" || fn === "activated";
const isNumericAgg = (fn: AggFn) => isSummable(fn) || fn === "share" || fn === "activatedShare";

function aggNumber(a: Agg, cf: CalcField, total: number): number | null {
  switch (cf.agg) {
    case "count":
      return a.count;
    case "uniqueEmployees":
      return a.identities.size;
    case "share":
      return total > 0 ? (a.count / total) * 100 : 0;
    case "activated":
      return a.activated;
    case "activatedShare":
      return a.count > 0 ? (a.activated / a.count) * 100 : 0;
    default:
      return null;
  }
}

function aggValue(a: Agg, cf: CalcField, dataset: Dataset, total: number): string | number {
  const n = aggNumber(a, cf, total);
  if (cf.agg === "share" || cf.agg === "activatedShare") return `${(n ?? 0).toFixed(1)}%`;
  if (n != null) return n;
  const f = cf.field ?? PRIMARY_DATE[dataset];
  const d = (cf.agg === "firstDate" ? a.mins : a.maxs).get(f);
  return d ? fmtDate(d) : "—";
}

function groupValue<R>(def: DatasetDef<R>, dataset: Dataset, row: R, gf: GroupField): string {
  const acc = def.accessors[gf.field];
  if (!acc) return "—";
  if (acc.date) {
    const d = acc.date(row);
    return d ? dateBucketKey(d, gf.bucket ?? "day") : "(нет даты)";
  }
  if (acc.display) return acc.display(row);
  const raw = acc.raw(row);
  if (raw == null || raw === "") return "(не указано)";
  const meta = fieldMeta(dataset, gf.field);
  return meta?.options?.find((o) => o.value === raw)?.label ?? raw;
}

function computeGrouped<R>(
  def: DatasetDef<R>,
  cfg: BuilderConfig,
  rows: R[],
): BuilderResult {
  const { dataset, groupFields, calcFields } = cfg;
  const dateFields = [...new Set(calcFields.filter((c) => c.agg === "firstDate" || c.agg === "lastDate").map((c) => c.field ?? PRIMARY_DATE[dataset]))];
  const groups = new Map<string, { values: string[]; agg: Agg }>();
  for (const row of rows) {
    const values = groupFields.map((gf) => groupValue(def, dataset, row, gf));
    const key = values.join("\u0001");
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { values, agg: newAgg() }));
    feedAgg(g.agg, row, def, dateFields);
  }

  const total = rows.length;
  const dateFirst = !!def.accessors[groupFields[0]?.field]?.date;
  let entries = [...groups.values()];
  const first = calcFields[0];
  if (dateFirst) {
    entries.sort((a, b) => a.values.join("").localeCompare(b.values.join("")));
  } else {
    entries.sort((a, b) => {
      const av = aggNumber(a.agg, first, total);
      const bv = aggNumber(b.agg, first, total);
      if (av != null && bv != null && av !== bv) return bv - av;
      return a.values.join("").localeCompare(b.values.join(""), "ru");
    });
  }
  if (cfg.limit) entries = entries.slice(0, cfg.limit);

  const columns: BuilderColumn[] = [
    ...groupFields.map((gf, i) => ({
      key: `g${i}`,
      label:
        (fieldMeta(dataset, gf.field)?.label ?? gf.field) +
        (def.accessors[gf.field]?.date && gf.bucket ? ` (${DATE_BUCKET_LABELS[gf.bucket].toLowerCase()})` : ""),
      numeric: false,
    })),
    ...calcFields.map((cf, i) => ({ key: `c${i}`, label: cf.label, numeric: isNumericAgg(cf.agg) })),
  ];

  const outRows = entries.map((e) => {
    const row: Record<string, string | number> = {};
    e.values.forEach((v, i) => (row[`g${i}`] = v));
    calcFields.forEach((cf, i) => (row[`c${i}`] = aggValue(e.agg, cf, dataset, total)));
    return row;
  });

  const totals: Record<string, number> = {};
  calcFields.forEach((cf, i) => {
    if (!isSummable(cf.agg)) return;
    totals[`c${i}`] = outRows.reduce((s, r) => s + (r[`c${i}`] as number), 0);
  });

  return { columns, rows: outRows, totals: Object.keys(totals).length ? totals : null, matchedCount: rows.length };
}

async function runWithRows<R>(def: DatasetDef<R>, cfg: BuilderConfig): Promise<{ result: BuilderResult; conds: Condition[] }> {
  const conds = await resolveConditions(cfg.conditions);
  const loaded = await def.load(conds);
  const rows = applyConditions(def, cfg.dataset, loaded, conds);
  return { result: computeGrouped(def, cfg, rows), conds };
}

export async function runBuilderReport(cfg: BuilderConfig): Promise<BuilderResult> {
  return (await runWithRows(DATASETS[cfg.dataset], cfg)).result;
}

// ---------- Сравнение с предыдущим периодом ----------

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Результат + колонки «Δ к прошлому периоду» для счётных вычисляемых полей.
 * Работает при условии «Период равно …» (или «Текущий период») в датасетах с периодом.
 */
export async function runBuilderReportCompared(
  cfg: BuilderConfig,
): Promise<{ result: BuilderResult; compareNote: string | null }> {
  const result = await runBuilderReport(cfg);
  if (!cfg.compare) return { result, compareNote: null };
  if (cfg.dataset === "support") return { result, compareNote: "Сравнение доступно только для льгот и купонов." };
  const cond = cfg.conditions.find((c) => c.field === "period" && c.op === "eq" && c.value);
  if (!cond) return { result, compareNote: "Для сравнения добавьте условие «Период равно …»." };

  const resolved = (await resolveConditions([cond]))[0];
  const cur = await db.period.findUnique({ where: { id: resolved.value }, select: { startDate: true } });
  const prev = cur
    ? await db.period.findFirst({ where: { startDate: { lt: cur.startDate } }, orderBy: { startDate: "desc" }, select: { id: true, name: true } })
    : null;
  if (!prev) return { result, compareNote: "Предыдущего периода нет — сравнивать не с чем." };

  const prevResult = await runBuilderReport({
    ...cfg,
    limit: undefined,
    conditions: cfg.conditions.map((c) => (c === cond ? { ...c, value: prev.id } : c)),
  });

  const nGroups = cfg.groupFields.length;
  const keyOf = (r: Record<string, string | number>) => Array.from({ length: nGroups }, (_, i) => r[`g${i}`]).join("\u0001");
  const prevRows = new Map(prevResult.rows.map((r) => [keyOf(r), r]));
  const countIdx = cfg.calcFields.flatMap((c, i) => (isSummable(c.agg) ? [i] : []));

  const columns = [...result.columns];
  for (const i of countIdx) columns.push({ key: `d${i}`, label: `Δ ${cfg.calcFields[i].label} к «${prev.name}»`, numeric: true });
  const delta = (cur: number, before: number) =>
    before === 0 ? (cur === 0 ? "0" : `${signed(cur)} (новое)`) : `${signed(cur - before)} (${signed(Math.round(((cur - before) / before) * 100))}%)`;

  const rows = result.rows.map((r) => {
    const p = prevRows.get(keyOf(r));
    const out = { ...r };
    for (const i of countIdx) out[`d${i}`] = delta(r[`c${i}`] as number, (p?.[`c${i}`] as number) ?? 0);
    return out;
  });
  return { result: { ...result, columns, rows }, compareNote: `Сравнение с периодом «${prev.name}».` };
}

// Частые русские служебные слова + типичные приветственные обороты — не несут
// смысла в сводке «что чаще всего пишут», только шумят в топе.
const STOPWORDS = new Set([
  "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то", "все", "она",
  "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за", "бы", "по", "только", "ее",
  "мне", "было", "вот", "от", "меня", "еще", "ещё", "нет", "о", "из", "ему", "теперь", "когда",
  "даже", "ну", "вдруг", "ли", "если", "уже", "или", "ни", "быть", "был", "него", "до",
  "вас", "нибудь", "опять", "уж", "вам", "ведь", "там", "потом", "себя", "ничего",
  "ей", "может", "они", "тут", "где", "есть", "надо", "ней", "для", "мы", "тебя", "их",
  "чем", "была", "сам", "чтоб", "без", "будто", "чего", "раз", "тоже", "себе", "под",
  "будет", "тогда", "кто", "этот", "того", "потому", "этого", "какой", "совсем",
  "ним", "здесь", "этом", "один", "почти", "мой", "тем", "чтобы", "нее", "неё", "сейчас", "были",
  "куда", "зачем", "всех", "никогда", "можно", "при", "наконец", "два", "об", "другой",
  "хоть", "после", "над", "больше", "тот", "через", "эти", "нас", "про", "всего", "них",
  "какая", "много", "разве", "три", "эту", "моя", "впрочем", "хорошо", "свою", "этой",
  "перед", "иногда", "лучше", "чуть", "том", "нельзя", "такой", "им", "более", "всегда",
  "конечно", "всю", "между", "также", "который", "которая", "которые", "это",
  "здравствуйте", "добрый", "день", "вечер", "утро", "пожалуйста", "спасибо", "подскажите",
]);

const WORD_RE = /[a-zа-яё0-9]+/gi;

// Тело автослужебных сообщений бота начинается с тега в квадратных скобках
// (`[Поделился контактом] ...`, `[Вопрос] ...`) — живой текст от человека так
// никогда не начинается.
// Отчества и тюркские/таджикские «сын/дочь» — это всегда часть ФИО, а не тема обращения.
const PATRONYMIC_RE = /(ович|евич|ьич|овна|евна|ична|угли|кизи|кызы|заде)$/;

// Приветствия на таджикском/узбекском — такой же шум, как «здравствуйте».
const GREETING_WORDS = ["ассалому", "алейкум", "салом", "рахмат", "барои", "мешавад", "хуб", "ассалом", "алайкум", "рахмат"];

const SYSTEM_MESSAGE_RE = /^\[[^\]]+\]/;



/**
 * Сообщение — ответ в диалоге авторегистрации, если это «представление»: в нём есть имя
 * и должность/подразделение, либо оно целиком состоит из слов профиля (имя, должность, отдел)
 * и номера телефона, либо это просто номер телефона.
 */
function isRegistrationReply(ws: string[], names: Set<string>, jobWords: Set<string>): boolean {
  const meaningful = ws.filter((w) => w.length >= 2 && !GREETING_WORDS.includes(w) && !STOPWORDS.has(w));
  if (meaningful.length === 0) return true;
  if (meaningful.every((w) => /^\d+$/.test(w))) return true; // только телефон/цифры
  const hasName = meaningful.some((w) => names.has(w) || PATRONYMIC_RE.test(w));
  const hasJob = meaningful.some((w) => jobWords.has(w));
  if (hasName && hasJob) return true;
  return meaningful.every((w) => /^\d+$/.test(w) || names.has(w) || jobWords.has(w) || PATRONYMIC_RE.test(w));
}

/**
 * Топ слов из текстов входящих сообщений обращений («какие слова чаще всего
 * пишут») — те же условия, что и у датасета «Обращения».
 */
export async function topSupportWords(cfg: BuilderConfig, limit = 30): Promise<WordFreq[]> {
  const conds = await resolveConditions(cfg.conditions);
  const threads = applyConditions(support, "support", await support.load(conds), conds);
  if (threads.length === 0) return [];

  const messages = await db.supportMessage.findMany({
    where: { direction: "IN", threadId: { in: threads.map((t) => t.id) } },
    select: { body: true },
  });

  // Словарь профиля сотрудников: ФИО отдельно, должности/подразделения отдельно. Гость при авторегистрации
  // в боте пишет «ФИО, должность, отдел» (см. self-registration.ts) — это ответы на вопросы бота, а не обращение.
  const words = (text: string) => text.toLowerCase().match(WORD_RE) ?? [];
  const names = new Set<string>();
  const jobWords = new Set<string>();
  for (const e of await db.employee.findMany({ select: { fullName: true, position: true, department: true } })) {
    for (const w of words(e.fullName)) if (w.length >= 3) names.add(w);
    for (const w of words(`${e.position} ${e.department}`)) if (w.length >= 3) jobWords.add(w);
  }

  const counts = new Map<string, number>();
  for (const m of messages) {
    // Системные служебные сообщения бота помечены тегом `[...]` в начале тела
    // (см. appendGuestMessage в api/telegram/route.ts) — это не текст человека.
    if (SYSTEM_MESSAGE_RE.test(m.body)) continue;
    const ws = words(m.body);
    if (isRegistrationReply(ws, names, jobWords)) continue;
    for (const w of ws) {
      if (w.length < 3 || STOPWORDS.has(w) || names.has(w) || PATRONYMIC_RE.test(w) || GREETING_WORDS.includes(w) || /^\d+$/.test(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

