import type { Locale } from "./i18n/shared";

/**
 * Достаёт переведённое значение поля из JSON-колонки `translations`
 * (`{ tg?: { <field>?: string }, uz?: { <field>?: string } }`), которую
 * заполняет C&B в админке. Пусто/язык не «tg»/«uz»/нет перевода — остаётся
 * русский текст из самой записи (`base`).
 */
export function localize<T extends string | null>(
  base: T,
  translations: unknown,
  locale: Locale,
  field: string,
): T {
  if (locale === "ru") return base;
  const byLocale = (translations as Record<string, Record<string, string>> | null | undefined)?.[locale];
  const v = byLocale?.[field];
  return (v && v.trim() ? v : base) as T;
}
