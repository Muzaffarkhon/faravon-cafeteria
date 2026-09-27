const TIMEZONE = "Asia/Dushanbe";

/** Календарная дата по душанбинскому времени (UTC+5) — граница "нового дня" для идемпотентных ключей. */
export function dushanbeDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
