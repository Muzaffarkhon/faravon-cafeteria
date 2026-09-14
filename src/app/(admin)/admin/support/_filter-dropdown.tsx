"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

/**
 * Сворачивает фильтры-чипы в выпадающий список — в узкой боковой панели
 * (340px) четыре группы фильтров, показанные постоянно, съедали больше места,
 * чем сам список диалогов. Раскрывается по клику, закрывается кликом мимо.
 */
export function FilterDropdown({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cx(
          "flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
          open || count > 0
            ? "border-primary-border bg-primary-soft text-primary-strong"
            : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
        )}
      >
        <span>
          {label}
          {count > 0 ? ` (${count})` : ""}
        </span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cx("shrink-0 transition-transform", open && "rotate-180")}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 space-y-2.5 rounded-xl border border-line bg-surface p-3 shadow-lg">
            {children}
          </div>
        </>
      )}
    </div>
  );
}
