import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Код клиента для кассы: 6 цифр, меняется каждые 30 секунд (HMAC от id сотрудника и
 * номера окна, как TOTP). Сотрудник видит его в своём кабинете, кассир вводит при
 * проведении кешбека — так операция невозможна «по одному номеру телефона», без
 * ведома владельца счёта. Принимается текущее и предыдущее окно (запас ~30 с);
 * одноразовость обеспечивает `CashbackAccount.lastCodeWindow`.
 */

export const CODE_STEP_S = 30;

const windowOf = (ms: number) => Math.floor(ms / 1000 / CODE_STEP_S);

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET не задан");
  return createHmac("sha256", secret).update("cashback-code-v1").digest();
}

function codeFor(employeeId: string, w: number): string {
  const h = createHmac("sha256", key()).update(`${employeeId}:${w}`).digest();
  const off = h[h.length - 1] & 0x0f;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export function currentCashbackCode(employeeId: string, now: number = Date.now()) {
  const w = windowOf(now);
  return { code: codeFor(employeeId, w), secondsLeft: CODE_STEP_S - (Math.floor(now / 1000) % CODE_STEP_S) };
}

/** Окно, к которому относится введённый код (текущее или предыдущее), либо null. */
export function matchCashbackCodeWindow(employeeId: string, input: string, now: number = Date.now()): number | null {
  const digits = String(input ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const given = Buffer.from(digits);
  const w = windowOf(now);
  let matched: number | null = null;
  // Без раннего выхода: время проверки не зависит от того, какое окно совпало.
  for (const cand of [w, w - 1]) {
    const ok = timingSafeEqual(given, Buffer.from(codeFor(employeeId, cand)));
    if (ok && matched === null) matched = cand;
  }
  return matched;
}
