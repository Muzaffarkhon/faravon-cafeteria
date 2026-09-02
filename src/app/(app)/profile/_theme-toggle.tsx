"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

type Theme = "system" | "light" | "dark";
const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "system", label: "Системная", icon: "M4 5h16v10H4z||M9 19h6M12 15v4" },
  { value: "light", label: "Светлая", icon: "M12 4V2||M12 22v-2||M5 5 3.5 3.5||M20.5 20.5 19 19||M4 12H2||M22 12h-2||M5 19l-1.5 1.5||M20.5 3.5 19 5||M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
  { value: "dark", label: "Тёмная", icon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" },
];
const KEY = "faravon.theme";

export function ThemeToggle() {
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

  return (
    <div className="mt-4 inline-flex rounded-xl border border-line bg-surface-muted p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => apply(o.value)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            theme === o.value
              ? "bg-surface text-ink shadow-xs"
              : "text-ink-muted hover:text-ink",
          )}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {o.icon.split("||").map((d, i) => (
              <path key={i} d={d} />
            ))}
          </svg>
          {o.label}
        </button>
      ))}
    </div>
  );
}
