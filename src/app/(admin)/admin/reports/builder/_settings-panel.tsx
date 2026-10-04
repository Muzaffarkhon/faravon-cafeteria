"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * Сворачиваемая боковая панель настроек отчёта: в свёрнутом виде таблица
 * занимает всю ширину. Состояние живёт в клиентском компоненте и переживает
 * переходы по параметрам (то же дерево на той же странице).
 */
export function SettingsPanel({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <aside className={cx("w-full shrink-0 lg:sticky lg:top-3 lg:self-start", open ? "lg:w-64" : "lg:w-9")}>
      <div className="rounded-xl border border-line bg-surface shadow-sm">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle hover:text-ink"
        >
          <span className={cx(!open && "lg:hidden")}>{title}</span>
          <span aria-hidden>{open ? "⟩" : "⟨"}</span>
        </button>
        <div className={cx("border-t border-line-subtle p-3", !open && "hidden")}>{children}</div>
      </div>
    </aside>
  );
}
