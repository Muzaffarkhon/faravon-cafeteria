"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string; badge?: number };

function isActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(href + "/");
}

function Count({ n }: { n: number }) {
  return (
    <span
      className="ml-1 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] font-semibold leading-[1.125rem] text-on-brand tabular-nums"
      aria-label={`${n} на согласовании`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (onClick?: () => void) =>
    items.map((it) => {
      const active = isActive(pathname, it.href);
      return (
        <Link
          key={it.href}
          href={it.href}
          onClick={onClick}
          aria-current={active ? "page" : undefined}
          className={cx(
            "inline-flex items-center rounded-sm py-1 transition-colors",
            active ? "font-medium text-primary" : "text-ink-muted hover:text-primary",
          )}
        >
          {it.label}
          {it.badge ? <Count n={it.badge} /> : null}
        </Link>
      );
    });

  return (
    <>
      {/* ≥ md: горизонтальный ряд */}
      <nav className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-sm md:flex">
        {links()}
      </nav>

      {/* < md: кнопка-меню */}
      <div className="relative md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Меню разделов"
          className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 py-1 text-sm text-ink shadow-xs"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          Разделы
          {items.some((i) => i.badge) && !open ? (
            <span className="ml-0.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          ) : null}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
            <nav className="absolute right-0 z-50 mt-2 flex w-56 flex-col gap-1 rounded-lg border border-line bg-surface p-2 text-sm shadow-lg">
              {links(() => setOpen(false))}
            </nav>
          </>
        )}
      </div>
    </>
  );
}
