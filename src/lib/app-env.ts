import "server-only";

/**
 * Песочница (изолированная тестовая среда) — это отдельный деплой того же кода
 * с отдельной схемой БД (`?schema=test`). Отличается от боевого ТОЛЬКО
 * переменными окружения, поэтому «где я сейчас» определяется одним признаком:
 * задан ли `SANDBOX_LABEL`.
 *
 * На этом же признаке висит защита разрушающих тестовых действий (очистка
 * заявок и купонов): на боевом деплое переменной нет — значит, действие
 * физически не выполнится, даже если кто-то откроет страницу по прямой ссылке.
 */
export function isSandbox(): boolean {
  return !!process.env.SANDBOX_LABEL?.trim();
}

/** Подпись среды для плашки наверху («Тестовая среда»). */
export function sandboxLabel(): string | null {
  return process.env.SANDBOX_LABEL?.trim() || null;
}

/** Адрес песочницы — показывается ссылкой на боевом деплое. */
export function sandboxUrl(): string | null {
  const url = process.env.SANDBOX_URL?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}
