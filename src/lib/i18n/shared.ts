/** Общая часть i18n, безопасная и для клиентских, и для серверных компонентов. */

export const LOCALES = ["ru", "tg", "uz"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: "Русский",
  tg: "Тоҷикӣ",
  uz: "Ўзбекча",
};

/** Короткие инициалы для компактного переключателя языка в шапке. */
export const LOCALE_SHORT: Record<Locale, string> = {
  ru: "RU",
  tg: "TJ",
  uz: "UZ",
};

export const LOCALE_COOKIE = "faravon.locale";

/** Язык Telegram-клиента (`language_code`, например "tg", "uz-UZ", "ru") → наш язык; всё прочее — русский. */
export function localeFromTelegram(code?: string | null): Locale {
  const c = (code ?? "").toLowerCase().slice(0, 2);
  return c === "tg" || c === "uz" ? c : "ru";
}

/** Значение из БД/формы → язык или null, если это не ru/tg/uz. */
export function asLocale(v: unknown): Locale | null {
  return (LOCALES as readonly string[]).includes(v as string) ? (v as Locale) : null;
}
