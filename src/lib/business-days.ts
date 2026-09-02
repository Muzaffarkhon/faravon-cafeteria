/**
 * Рабочие дни (§5.12: SLA согласования — «5 рабочих дней»).
 * Суббота и воскресенье не считаются. Праздники РТ не учитываются
 * (список праздников — предмет отдельной настройки, при необходимости).
 */

const MS_DAY = 24 * 60 * 60 * 1000;

function isWeekend(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6;
}

/** Сколько полных рабочих дней прошло между `from` и `to` (to >= from). */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let count = 0;
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (!isWeekend(cur)) count++;
  }
  return count;
}

/** Дата, отстоящая на `n` рабочих дней назад от `ref` (по умолчанию — сейчас). */
export function businessDaysAgo(n: number, ref: Date = new Date()): Date {
  const d = new Date(ref.getTime());
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (!isWeekend(d)) left--;
  }
  return d;
}

/** Просрочен ли SLA: с момента `since` прошло больше `slaDays` рабочих дней. */
export function isSlaBreached(since: Date, slaDays: number, now: Date = new Date()): boolean {
  return businessDaysBetween(since, now) > slaDays;
}

export { MS_DAY };
