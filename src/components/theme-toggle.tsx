"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

type Theme = "system" | "light" | "dark";
const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "system", label: "Системная", icon: "M4 5h16v10H4z||M9 19h6M12 15v4" },
  { value: "light", label: "Светлая", icon: "M12 4V2||M12 22v-2||M5 5 3.5 3.5||M20.5 20.5 19 19||M4 12H2||M22 12h-2||M5 19l-1.5 1.5||M20.5 3.5 19 5||M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
  { value: "dark", label: "Тёмная", icon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" },
];
const KEY = "faravon.theme";

function Icon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split("||").map((seg, i) => (
        <path key={i} d={seg} />
      ))}
    </svg>
  );
}

/** Переключатель темы оформления. `compact` — только иконки, для шапки/логина. */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v === "light" || v === "dark" || v === "system") setThemeState(v);
    } catch {
      /* приватный режим */
    }
  }, []);

  function apply(t: Theme) {
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* noop */
    }
    const root = document.documentElement;
    if (t === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
  }

  if (compact) {
    return (
      <div
        role="group"
        aria-label="Тема оформления"
        className={cx("flex h-9 items-center gap-0.5 rounded-full border border-line bg-surface p-1", className)}
      >
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => apply(o.value)}
            aria-label={o.label}
            aria-pressed={theme === o.value}
            title={o.label}
            className={cx(
              "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
              theme === o.value ? "bg-primary text-on-brand" : "text-ink-muted hover:bg-surface-muted",
            )}
          >
            <Icon d={o.icon} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cx("mt-4 inline-flex rounded-xl border border-line bg-surface-muted p-1", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => apply(o.value)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            theme === o.value ? "bg-surface text-ink shadow-xs" : "text-ink-muted hover:text-ink",
          )}
        >
          <Icon d={o.icon} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
