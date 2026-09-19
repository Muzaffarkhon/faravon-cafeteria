/**
 * Ссылка, которую кодирует QR купона. Обычная камера телефона распознаёт её как ссылку и
 * открывает кассу сразу с найденным купоном (`/provider?number=...`); встроенный сканер кассы
 * достаёт номер из `?number=`. Если PLATFORM_URL не задан — как раньше, просто номер.
 * Без server-only: нужна и веб-приложению, и Telegram-доставке (бот).
 */
export function couponScanUrl(number: string): string {
  const base = (process.env.PLATFORM_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}/provider?number=${encodeURIComponent(number)}` : number;
}
