import "server-only";
import { cookies } from "next/headers";
import { translate, type TKey } from "./i18n/dict";
import { LOCALES, LOCALE_COOKIE, type Locale } from "./i18n/shared";

export { LOCALES, LOCALE_LABELS, LOCALE_COOKIE, type Locale } from "./i18n/shared";

/** Текущий язык интерфейса — из cookie, по умолчанию русский. */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  return (LOCALES as readonly string[]).includes(v ?? "") ? (v as Locale) : "ru";
}

/** Переводчик для серверных компонентов: `const t = await getTranslator(); t("login.submit")`. */
export async function getTranslator(): Promise<(key: TKey) => string> {
  const locale = await getLocale();
  return (key: TKey) => translate(locale, key);
}
