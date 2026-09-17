import "server-only";
import { db } from "@/lib/db";
import type { ItemStatus, SupportThreadSource, SupportThreadStatus } from "@prisma/client";
import {
  DATE_BUCKET_LABELS,
  GROUP_CATALOG,
  CALC_CATALOG,
  type BuilderConfig,
  type BuilderColumn,
  type BuilderResult,
  type CalcField,
  type DateBucket,
  type GroupField,
  type GroupFieldId,
  type AggFn,
  type WordFreq,
} from "@/lib/report-builder-shared";

/**
 * Конструктор сводных отчётов (§ «Отчёты»): произвольный набор полей
 * группировки (каждое — своя колонка результата, дата — с выбором
 * периодичности разбивки) + произвольный набор вычисляемых полей
 * (агрегатная функция на каждое) поверх одного из двух источников данных
 * (`Dataset`): «Льготы» (ApplicationItem — заявка → позиция → льгота) или
 * «Обращения» (SupportThread — чат поддержки: тема/источник/статус) —
 * плюс отдельно «Топ слов» по текстам входящих сообщений обращений
 * (`topSupportWords`). Данные считаются в памяти (тот же приём, что и
 * `computeReport` в `reports.ts`) — датасет одного среза умещается без
 * проблем.
 *
 * Типы и справочники (без обращения к БД) вынесены в
 * `report-builder-shared.ts` — этот файл использует `server-only`, поэтому
 * ничего из него нельзя импортировать в клиентские компоненты (сборка
 * рушится: «'server-only' cannot be imported from a Client Component
 * module»), а `_fields-editor.tsx`/`_filter-modal.tsx` нужны как раз только
 * типы и справочники.
 */
export * from "@/lib/report-builder-shared";

export async function listPeriodsForBuilder() {
  return db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } });
}

const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  DRAFT: "Черновик",
  PENDING: "На согласовании",
  APPROVED: "Одобрено",
  REJECTED: "Отклонено",
  COUPON_CREATED: "Купон сформирован",
  COUPON_ISSUED: "Купон выдан",
  CANCELLED: "Отменено",
};

const THREAD_STATUS_LABELS: Record<SupportThreadStatus, string> = {
  OPEN: "Открыто",
  CLOSED: "Закрыто",
};

const SOURCE_LABELS: Record<SupportThreadSource, string> = {
  TELEGRAM: "Telegram",
  WEB: "Сайт",
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

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" });

type Agg = { count: number; identities: Set<string>; minDate: Date | null; maxDate: Date | null };

function newAgg(): Agg {
  return { count: 0, identities: new Set(), minDate: null, maxDate: null };
}

function feedAgg(a: Agg, identity: string, date: Date | null) {
  a.count += 1;
  a.identities.add(identity);
  if (date) {
    if (!a.minDate || date < a.minDate) a.minDate = date;
    if (!a.maxDate || date > a.maxDate) a.maxDate = date;
  }
}

function aggValue(a: Agg, fn: AggFn): string | number {
  switch (fn) {
    case "count":
      return a.count;
    case "uniqueEmployees":
      return a.identities.size;
    case "firstDate":
      return a.minDate ? dateFormatter.format(a.minDate) : "—";
    case "lastDate":
      return a.maxDate ? dateFormatter.format(a.maxDate) : "—";
  }
}

const isNumericAgg = (fn: AggFn) => fn === "count" || fn === "uniqueEmployees";

/** Общая сборка результата (группировка + сортировка + колонки) — дата-специфичные части (значение поля, дата, идентичность строки) приходят через параметры-функции. */
function computeGrouped<T>(
  rows: T[],
  groupFields: GroupField[],
  calcFields: CalcField[],
  labelFor: (id: GroupFieldId) => string,
  valueOf: (row: T, gf: GroupField) => string,
  identityOf: (row: T) => string,
  dateOf: (row: T) => Date | null,
  limit: number | undefined,
): BuilderResult {
  const groups = new Map<string, { values: string[]; agg: Agg }>();
  for (const row of rows) {
    const values = groupFields.map((gf) => valueOf(row, gf));
    const key = values.join("");
    const g = groups.get(key) ?? { values, agg: newAgg() };
    feedAgg(g.agg, identityOf(row), dateOf(row));
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
  if (limit && limit > 0) entries = entries.slice(0, limit);

  const columns: BuilderColumn[] = [
    ...groupFields.map((gf, i) => ({
      key: `g${i}`,
      label: labelFor(gf.field) + (gf.field === "date" && gf.bucket ? ` (${DATE_BUCKET_LABELS[gf.bucket]})` : ""),
      numeric: false,
    })),
    ...calcFields.map((cf, i) => ({ key: `c${i}`, label: cf.label, numeric: isNumericAgg(cf.agg) })),
  ];

  const outRows = entries.map((e) => {
    const row: Record<string, string | number> = {};
    e.values.forEach((v, i) => (row[`g${i}`] = v));
    calcFields.forEach((cf, i) => (row[`c${i}`] = aggValue(e.agg, cf.agg)));
    return row;
  });

  const totals: Record<string, number> = {};
  calcFields.forEach((cf, i) => {
    if (!isNumericAgg(cf.agg)) return;
    totals[`c${i}`] = outRows.reduce((s, r) => s + (r[`c${i}`] as number), 0);
  });

  return { columns, rows: outRows, totals: Object.keys(totals).length ? totals : null, matchedCount: rows.length };
}

type BenefitItem = {
  status: ItemStatus;
  submittedAt: Date | null;
  application: {
    employeeId: string;
    period: { name: string };
    employee: { department: string | null };
  };
  card: { title: string; partner: { name: string } | null };
};

function benefitsValue(i: BenefitItem, gf: GroupField): string {
  switch (gf.field) {
    case "department":
      return i.application.employee.department || "(без подразделения)";
    case "card":
      return i.card.title;
    case "partner":
      return i.card.partner?.name ?? "(без партнёра)";
    case "status":
      return ITEM_STATUS_LABELS[i.status];
    case "period":
      return i.application.period.name;
    case "date":
      return i.submittedAt ? dateBucketKey(i.submittedAt, gf.bucket ?? "day") : "(не подано)";
    default:
      return "—";
  }
}

async function runBenefitsReport(cfg: BuilderConfig): Promise<BuilderResult> {
  const groupFields = cfg.groupFields.filter((f) => GROUP_CATALOG.benefits.some((c) => c.id === f.field));
  const resolvedGroupFields = groupFields.length ? groupFields : [{ field: "department" as const }];
  const calcFields = cfg.calcFields.length ? cfg.calcFields : [{ agg: "count" as const, label: CALC_CATALOG.benefits[0].label }];
  const status = (Object.keys(ITEM_STATUS_LABELS) as ItemStatus[]).find((s) => s === cfg.status);

  const items = await db.applicationItem.findMany({
    where: {
      status: status ? status : { not: "CANCELLED" },
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
          period: { select: { name: true } },
          employee: { select: { department: true } },
        },
      },
      card: { select: { title: true, partner: { select: { name: true } } } },
    },
  });

  const labelFor = (id: GroupFieldId) => GROUP_CATALOG.benefits.find((f) => f.id === id)?.label ?? id;
  return computeGrouped(
    items,
    resolvedGroupFields,
    calcFields,
    labelFor,
    benefitsValue,
    (i) => i.application.employeeId,
    (i) => i.submittedAt,
    cfg.limit,
  );
}

type SupportRow = {
  id: string;
  topic: string | null;
  source: SupportThreadSource;
  status: SupportThreadStatus;
  createdAt: Date;
  employeeId: string | null;
  telegramId: string | null;
  phone: string | null;
};

function supportValue(t: SupportRow, gf: GroupField): string {
  switch (gf.field) {
    case "topic":
      return t.topic || "(без темы)";
    case "source":
      return SOURCE_LABELS[t.source];
    case "threadStatus":
      return THREAD_STATUS_LABELS[t.status];
    case "date":
      return dateBucketKey(t.createdAt, gf.bucket ?? "day");
    default:
      return "—";
  }
}

/** Идентификатор «кто обратился» — для «Уникальных обратившихся»: сотрудник, иначе гость по chat id/телефону, иначе просто эта заявка (не с кем сгруппировать дальше). */
function supportIdentity(t: SupportRow): string {
  return t.employeeId ?? (t.telegramId ? `tg:${t.telegramId}` : null) ?? (t.phone ? `phone:${t.phone}` : null) ?? `thread:${t.id}`;
}

async function runSupportReport(cfg: BuilderConfig): Promise<BuilderResult> {
  const groupFields = cfg.groupFields.filter((f) => GROUP_CATALOG.support.some((c) => c.id === f.field));
  const resolvedGroupFields = groupFields.length ? groupFields : [{ field: "topic" as const }];
  const calcFields = cfg.calcFields.length ? cfg.calcFields : [{ agg: "count" as const, label: CALC_CATALOG.support[0].label }];
  const source = (["TELEGRAM", "WEB"] as SupportThreadSource[]).find((s) => s === cfg.source);
  const status = (["OPEN", "CLOSED"] as SupportThreadStatus[]).find((s) => s === cfg.status);

  const threads = await db.supportThread.findMany({
    where: {
      archivedAt: null,
      topic: cfg.topic || undefined,
      source: source || undefined,
      status: status || undefined,
      createdAt:
        cfg.dateFrom || cfg.dateTo
          ? {
              gte: cfg.dateFrom ? new Date(cfg.dateFrom) : undefined,
              lte: cfg.dateTo ? new Date(new Date(cfg.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined,
            }
          : undefined,
    },
    select: { id: true, topic: true, source: true, status: true, createdAt: true, employeeId: true, telegramId: true, phone: true },
  });

  const labelFor = (id: GroupFieldId) => GROUP_CATALOG.support.find((f) => f.id === id)?.label ?? id;
  return computeGrouped(
    threads,
    resolvedGroupFields,
    calcFields,
    labelFor,
    supportValue,
    supportIdentity,
    (t) => t.createdAt,
    cfg.limit,
  );
}

export async function runBuilderReport(cfg: BuilderConfig): Promise<BuilderResult> {
  return cfg.dataset === "support" ? runSupportReport(cfg) : runBenefitsReport(cfg);
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
const SYSTEM_MESSAGE_RE = /^\[[^\]]+\]/;

/**
 * Топ слов из текстов входящих сообщений обращений (§ «Обращения»: «какие
 * слова чаще всего пишут») — те же фильтры, что и у группировки по датасету
 * support (тема/источник/статус/период), только на уровне SupportMessage.
 */
export async function topSupportWords(
  cfg: Pick<BuilderConfig, "dateFrom" | "dateTo" | "topic" | "source" | "status">,
  limit = 30,
): Promise<WordFreq[]> {
  const source = (["TELEGRAM", "WEB"] as SupportThreadSource[]).find((s) => s === cfg.source);
  const status = (["OPEN", "CLOSED"] as SupportThreadStatus[]).find((s) => s === cfg.status);

  const messages = await db.supportMessage.findMany({
    where: {
      direction: "IN",
      thread: {
        archivedAt: null,
        topic: cfg.topic || undefined,
        source: source || undefined,
        status: status || undefined,
      },
      createdAt:
        cfg.dateFrom || cfg.dateTo
          ? {
              gte: cfg.dateFrom ? new Date(cfg.dateFrom) : undefined,
              lte: cfg.dateTo ? new Date(new Date(cfg.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined,
            }
          : undefined,
    },
    select: { body: true },
  });

  const counts = new Map<string, number>();
  for (const m of messages) {
    // Системные служебные сообщения бота (нажатие «Поделиться контактом»,
    // клик по готовому вопросу из FAQ) помечены тегом `[...]` в начале тела
    // (см. appendGuestMessage в api/telegram/route.ts) — это не то, что
    // человек сам написал, поэтому в «Топ слов» их не считаем.
    if (SYSTEM_MESSAGE_RE.test(m.body)) continue;
    const words = m.body.toLowerCase().match(WORD_RE) ?? [];
    for (const w of words) {
      if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
