"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string; badge?: number; soon?: boolean };

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
            "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150",
            active
              ? "bg-primary-soft text-primary-strong ring-1 ring-primary-border shadow-xs"
              : "text-ink-muted hover:bg-surface-muted hover:text-ink",
          )}
        >
          {it.label}
          {it.badge ? <Count n={it.badge} /> : null}
          {it.soon ? (
            <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-ink-subtle">
              скоро
            </span>
          ) : null}
        </Link>
      );
    });

  return (
    <>
      {/* ≥ md: горизонтальный ряд */}
      <nav className="hidden flex-wrap items-center gap-2 md:flex">
        {links()}
      </nav>

      {/* < md: кнопка-меню */}
      <div className="relative md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Меню разделов"
          className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink shadow-xs"
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
            <nav className="absolute right-0 z-50 mt-2 flex w-64 flex-col gap-1 rounded-2xl border border-line bg-surface p-2 text-sm shadow-lg">
              {links(() => setOpen(false))}
            </nav>
          </>
        )}
      </div>
    </>
  );
}
