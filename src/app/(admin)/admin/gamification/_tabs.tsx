"use client";

/**
 * Вкладки на одной странице (без перехода/перезагрузки): раздел разросся до
 * шести карточек подряд («как лендинг», жалоба C&B) — контент каждой вкладки
 * уже отрендерен сервером, здесь только переключение видимости через `hidden`,
 * поэтому состояние форм внутри не теряется при переключении.
 */
import { useState } from "react";
import { cx } from "@/components/ui";

export type AdminTab = { id: string; label: string; badge?: number };

export function TabsShell({ tabs, panels }: { tabs: AdminTab[]; panels: React.ReactNode[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={cx(
                "flex items-center gap-1.5 rounded-t-lg px-3.5 py-2.5 text-sm font-bold transition-colors",
                isActive ? "bg-primary text-on-brand" : "text-ink-muted hover:bg-surface-muted",
              )}
            >
              {tab.label}
              {typeof tab.badge === "number" && tab.badge > 0 && (
                <span
                  className={cx(
                    "inline-flex min-w-[1.3rem] items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums",
                    isActive ? "bg-on-brand/25 text-on-brand" : "bg-primary text-on-brand",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, i) => (
        <div key={tab.id} role="tabpanel" hidden={active !== tab.id} className="space-y-6">
          {panels[i]}
        </div>
      ))}
    </div>
  );
}
