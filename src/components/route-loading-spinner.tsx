/**
 * Индикатор загрузки маршрута — обычный блок в потоке <main>, а не fixed-портал.
 * Раньше пытались измерять bounding rect <main> через JS и центрировать fixed-элемент
 * поверх экрана: в момент перехода <main> на миг пуст, его высота измерялась то 0,
 * то мимо реального контента — спиннер визуально прилипал к шапке вместо центра.
 * min-h держит спиннер по центру своего блока без всякого измерения DOM.
 */
export function RouteLoadingSpinner({ label }: { label: string }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "60dvh" }}
      aria-busy="true"
      aria-label={label}
    >
      <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-primary shadow-lg" />
    </div>
  );
}
