/**
 * Мини-санитизация SVG перед загрузкой (§5.12). Убирает исполняемые части.
 * Это не полноценный DOMPurify: для внутреннего инструмента, где загружать
 * картинки могут только роли с правом cards.manage, и где SVG отдаётся как
 * <img src>, а не инлайном. Остаточный риск описан в отчёте.
 */
export function sanitizeSvg(source: string): string {
  let s = source;
  // DOCTYPE/ENTITY (XXE)
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  s = s.replace(/<!ENTITY[\s\S]*?>/gi, "");
  // <script>…</script>
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  s = s.replace(/<script[^>]*\/>/gi, "");
  // потенциально опасные элементы
  s = s.replace(/<(foreignObject|iframe|embed|object|audio|video|animate|set|use)\b[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<(foreignObject|iframe|embed|object|use|animate|set)\b[^>]*\/>/gi, "");
  // on*-обработчики
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // javascript:/data:text/html в href/src
  s = s.replace(/(href|xlink:href|src)\s*=\s*("|')\s*(javascript:|data:text\/html)[^"']*\2/gi, '$1=$2#$2');
  return s.trim();
}

export function isSvgSafe(source: string): boolean {
  return !/<script|<foreignObject|\son[a-z]+\s*=|javascript:|<!ENTITY/i.test(source);
}
