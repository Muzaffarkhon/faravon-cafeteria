/**
 * Инлайновый <script> в <head>/<body> (выполняется синхронно при парсинге HTML,
 * до первой отрисовки — нужно для THEME_INIT и т.п.). Next 16 предупреждает в
 * консоли на любой <script>, отрисованный React'ом на клиенте; тип
 * text/javascript→text/plain — задокументированный обход (см.
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
