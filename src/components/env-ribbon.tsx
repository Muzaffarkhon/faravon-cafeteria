import { sandboxLabel } from "@/lib/app-env";

/**
 * Плашка «это не боевая система» на самом верху страницы. Живёт в корневом
 * layout, поэтому видна везде, включая экран входа: перепутать песочницу с
 * продом, глядя на экран, невозможно. На боевом деплое не рендерится вовсе.
 */
export function EnvRibbon() {
  const label = sandboxLabel();
  if (!label) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-[13px] font-bold text-white"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
      </svg>
      {label}
    </div>
  );
}
