"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

type TabKey = "staff" | "service";

/**
 * Переключение «Сотрудники ↔ Служебные» без перехода по URL: обе таблицы
 * отрендерены сервером, здесь только показ/скрытие. Панель вкладок и всё над
 * контентом остаются на месте — при переключении ничего не «прыгает».
 * Активная вкладка пишется в query (`replaceState`), чтобы переживала refresh.
 */
export function UsersTabs({
  initial,
  commonActions,
  staffActions,
  staff,
  service,
}: {
  initial: TabKey;
  commonActions?: React.ReactNode;
  staffActions: React.ReactNode;
  staff: React.ReactNode;
  service: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>(initial);

  function select(next: TabKey) {
    if (next === tab) return;
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      if (next !== "staff") url.searchParams.delete("view");
      window.history.replaceState(null, "", url);
    } catch {
      /* SSR / приватный режим — не критично */
    }
  }

  const tabBtn = (key: TabKey, label: string) => (
    <button
      type="button"
      onClick={() => select(key)}
      aria-current={tab === key ? "page" : undefined}
      className={cx(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        tab === key ? "bg-primary text-on-brand" : "text-ink hover:bg-surface-muted",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex shrink-0 rounded-xl border border-line bg-surface p-0.5">
          {tabBtn("staff", "Сотрудники")}
          {tabBtn("service", "Служебные")}
        </div>
        {commonActions}
        <div className={cx("flex flex-wrap items-center gap-2", tab !== "staff" && "hidden")}>
          {staffActions}
        </div>
      </div>

      <div hidden={tab !== "staff"}>{staff}</div>
      <div hidden={tab !== "service"}>{service}</div>
    </div>
  );
}
