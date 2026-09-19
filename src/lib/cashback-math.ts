/**
 * Расчёт кешбека — чистые функции без обращения к БД (используются и на сервере,
 * и в кассе для предпросмотра, чтобы цифры совпадали). Все суммы — в дирамах
 * (1 сомони = 100 дирам), целые числа.
 */

export type CashbackCalcInput = {
  /** Сумма покупки по чеку. */
  purchase: number;
  /** Накопленный баланс сотрудника у этого партнёра. */
  balance: number;
  /** % кешбека (0 — не начисляется). */
  percent: number;
  /** Действует ли купон-кешбек сейчас (начисление только в период действия). */
  canAccrue: boolean;
  /** Сотрудник просит списать накопленный кешбек. */
  useBalance: boolean;
};

export type CashbackCalc = {
  /** Сколько кешбека списывается с покупки. */
  redeem: number;
  /** Сколько сотрудник реально платит. */
  paid: number;
  /** Сколько кешбека начислится (от оплаченной суммы). */
  accrue: number;
  /** Баланс после операции. */
  newBalance: number;
};

export function calcCashback({ purchase, balance, percent, canAccrue, useBalance }: CashbackCalcInput): CashbackCalc {
  const redeem = useBalance ? Math.min(balance, purchase) : 0;
  const paid = purchase - redeem;
  const accrue = canAccrue && percent > 0 ? Math.floor((paid * percent) / 100) : 0;
  return { redeem, paid, accrue, newBalance: balance - redeem + accrue };
}

/** Верхняя граница суммы одной покупки: 100 000 сомони. */
export const MAX_PURCHASE_DIRAM = 10_000_000;

/** Сколько операций по одной паре «сотрудник + партнёр» допускается в сутки (по времени Душанбе). */
export const MAX_OPERATIONS_PER_DAY = 5;

/** «12,5» / «12.50» → 1250 дирам; null — если не сумма. Не больше 2 знаков после запятой. */
export function parseSomoni(input: string): number | null {
  const s = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const v = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(v) && v > 0 && v <= MAX_PURCHASE_DIRAM ? v : null;
}

/** 1250 → «12,50». */
export function formatSomoni(diram: number): string {
  return (diram / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Длина кода клиента для кассы (цифр). Единая для сервера и формы кассира. */
export const CODE_DIGITS = 4;
