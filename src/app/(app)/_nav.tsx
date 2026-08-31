"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string };

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {items.map((it) => {
        const active =
          it.href === "/"
            ? pathname === "/"
            : pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-sm py-1 transition-colors",
              active
                ? "font-medium text-primary"
                : "text-ink-muted hover:text-primary",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
