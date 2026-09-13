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
