export const TIMEZONE = "Asia/Dushanbe";

type DateInput = Date | string | number;

/** Календарная дата по душанбинскому времени (UTC+5) — граница "нового дня" для идемпотентных ключей. */
export function dushanbeDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** "04.10.2026" — дата по Душанбе (не зависит от пояса сервера/браузера). */
export const fmtDate = (d: DateInput) => new Date(d).toLocaleDateString("ru-RU", { timeZone: TIMEZONE });

/** "04.10.2026, 15:30:00" — дата и время по Душанбе. */
export const fmtDateTime = (d: DateInput) => new Date(d).toLocaleString("ru-RU", { timeZone: TIMEZONE });

/** "04.10.2026, 15:30" — дата и время без секунд по Душанбе. */
export const fmtDateTimeShort = (d: DateInput) =>
  new Date(d).toLocaleString("ru-RU", { timeZone: TIMEZONE, dateStyle: "short", timeStyle: "short" });

/** "2026-10-04" (ISO-дата) по Душанбе — для экспортов и <input type="date">. */
export const dushanbeIsoDate = (d: DateInput) => dushanbeDateKey(new Date(d));

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Prisma-фильтр по DateTime из пары yyyy-mm-dd (включительно, сутки по Душанбе).
 * Мусорные/пустые значения игнорируются — `new Date("мусор")` иначе роняет запрос.
 */
export function dushanbeDayRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  const gte = from && ISO_DAY_RE.test(from) ? new Date(`${from}T00:00:00+05:00`) : undefined;
  const lte = to && ISO_DAY_RE.test(to) ? new Date(`${to}T23:59:59.999+05:00`) : undefined;
  const valid = (d?: Date) => (d && !Number.isNaN(d.getTime()) ? d : undefined);
  const r = { gte: valid(gte), lte: valid(lte) };
  return r.gte || r.lte ? r : undefined;
}
