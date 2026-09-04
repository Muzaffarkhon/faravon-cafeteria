/**
 * Проверка URL перед тем как положить его в href / src / CSS url().
 * Значения приходят из свободных полей («указать ссылку», ссылка баннера),
 * т.е. фактически пользовательский ввод — нельзя доверять схеме.
 */

/** Абсолютный http(s)-URL. */
export function isSafeHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Допустимая ссылка для `<a href>`: внутренний путь, якорь или http(s). */
export function isSafeLinkHref(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s) return false;
  if (/^\/(?!\/)/.test(s)) return true; // /internal/path (но не протокол-относительный //)
  if (s.startsWith("#")) return true;
  return isSafeHttpUrl(s);
}

/** Вернуть href, если он безопасен, иначе null. */
export function safeLinkHref(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return isSafeLinkHref(s) ? s : null;
}

/** Допустимый источник картинки для `<img src>`: внутренний путь, data:image/* или http(s). */
export function isSafeImageSrc(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s) return false;
  if (/^\/(?!\/)/.test(s)) return true;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(s)) return true;
  return isSafeHttpUrl(s);
}

/** Вернуть image src, если безопасен, иначе null. */
export function safeImageSrc(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return isSafeImageSrc(s) ? s : null;
}

/**
 * Безопасно ли подставить URL в инлайновый `style="background-image:url('...')"`.
 * Кроме проверки схемы запрещаем кавычки / скобки / обратный слэш / пробелы —
 * ими можно «выйти» из url(...) и дописать свои CSS-объявления.
 */
export function safeCssUrl(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!isSafeImageSrc(s)) return null;
  if (/["'()\\\s]/.test(s)) return null;
  return s;
}
