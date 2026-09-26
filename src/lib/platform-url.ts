/**
 * Адрес самого сайта (`PLATFORM_URL`) без хвостового `/`, всегда со схемой.
 * Модуль без server-only: нужен и веб-приложению, и Telegram-боту.
 *
 * Если переменную задали без `https://` (частая опечатка при вводе значения
 * в Vercel — просто домен, без схемы) — собранные из неё ссылки/QR-коды
 * телефон открывает как поисковый запрос, а не как страницу. Возвращает
 * `null`, если переменная не задана вовсе.
 */
export function platformUrl(): string | null {
  const raw = process.env.PLATFORM_URL?.trim().replace(/\/+$/, "");
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}
