"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { cx } from "@/components/ui";
import { logout } from "./actions";
import { LiveRefresh } from "./_live-refresh";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // path(s) для 24×24 stroke-иконки
  badge?: number;
  soon?: boolean;
};
export type NavGroup = { id: string; label: string; items: NavItem[] };

function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {path.split("||").map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

const I = {
  back: "M19 12H5||M12 19l-7-7 7-7",
  forward: "M5 12h14||M12 5l7 7-7 7",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  collapse: "M11 17l-5-5 5-5||M18 17l-5-5 5-5",
  expand: "M13 17l5-5-5-5||M6 17l5-5-5-5",
  chevron: "M6 9l6 6 6-6",
  profile: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z||M4 21v-1a8 8 0 0 1 16 0v1",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4||M16 17l5-5-5-5||M21 12H9",
};

const LS_COLLAPSED = "faravon.nav.collapsed";
const LS_GROUPS = "faravon.nav.groups";

export function AppShell({
  groups,
  roleLabel,
  backdrop,
  children,
}: {
  groups: NavGroup[];
  roleLabel: string;
  /** Ambient-слой (лепестки и т.п.) — рендерится внутри корня, за контентом. */
  backdrop?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      // читаем сохранённое состояние меню уже после гидратации
      /* eslint-disable react-hooks/set-state-in-effect */
      setCollapsed(localStorage.getItem(LS_COLLAPSED) === "1");
      const raw = localStorage.getItem(LS_GROUPS);
      if (raw) setClosed(JSON.parse(raw));
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* приватный режим — оставляем значения по умолчанию */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const nv = !v;
      try {
        localStorage.setItem(LS_COLLAPSED, nv ? "1" : "0");
      } catch {
        /* noop */
      }
      return nv;
    });
  }

  function toggleGroup(id: string) {
    setClosed((cur) => {
      const nv = { ...cur, [id]: !cur[id] };
      try {
        localStorage.setItem(LS_GROUPS, JSON.stringify(nv));
      } catch {
        /* noop */
      }
      return nv;
    });
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const navLink = (it: NavItem) => {
    const active = isActive(it.href);
    return (
      <Link
        key={it.href}
        href={it.href}
        onClick={() => setMobileOpen(false)}
        title={collapsed ? it.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cx(
          "group/link relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
          collapsed && "justify-center px-0",
          active
            ? "bg-primary-soft text-primary-strong"
            : "text-ink-muted hover:bg-surface-muted hover:text-ink",
        )}
      >
        <span
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
            active
              ? "bg-primary text-on-brand"
              : "bg-surface-muted text-ink-muted group-hover/link:bg-surface-sunken group-hover/link:text-ink",
          )}
        >
          <Icon path={it.icon} />
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate">
            {it.label}
            {it.soon && (
              <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-ink-subtle">
                скоро
              </span>
            )}
          </span>
        )}
        {it.badge ? (
          <span
            className={cx(
              "inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] font-semibold leading-[1.125rem] text-on-brand tabular-nums",
              collapsed && "absolute right-1 top-1",
            )}
          >
            {it.badge > 99 ? "99+" : it.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Бренд */}
      <div className={cx("flex items-center gap-2.5 px-4 py-4", collapsed && "justify-center px-0")}>
        <BrandMark size={collapsed ? 28 : 30} priority />
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink">Кафетерий льгот</div>
            <div className="text-[11px] text-ink-muted">«Фаровон»</div>
          </div>
        )}
      </div>

      {/* Навигация по группам */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-2">
        {groups.map((g) => {
          const isClosed = !collapsed && closed[g.id];
          return (
            <div key={g.id} className="pt-2 first:pt-0">
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle hover:text-ink-muted"
                >
                  {g.label}
                  <Icon
                    path={I.chevron}
                    className={cx("h-4 w-4 transition-transform", isClosed && "-rotate-90")}
                  />
                </button>
              ) : (
                <div className="mx-auto my-1 h-px w-6 bg-line" />
              )}
              {!isClosed && <div className="mt-0.5 space-y-0.5">{g.items.map(navLink)}</div>}
            </div>
          );
        })}
      </nav>

      {/* Низ: роль + профиль + выход + сворачивание */}
      <div className="space-y-1 border-t border-line px-3 py-3">
        {!collapsed && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            {roleLabel}
          </div>
        )}
        {navLink({ href: "/profile", label: "Профиль", icon: I.profile })}
        <form action={logout}>
          <button
            type="submit"
            title={collapsed ? "Выйти" : undefined}
            className={cx(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger",
              collapsed && "justify-center px-0",
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-muted">
              <Icon path={I.logout} />
            </span>
            {!collapsed && <span>Выйти</span>}
          </button>
        </form>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="mt-1 hidden w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-subtle transition-colors hover:bg-surface-muted hover:text-ink lg:flex"
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Icon path={collapsed ? I.expand : I.collapse} />
          </span>
          {!collapsed && <span>Свернуть</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative isolate flex min-h-dvh bg-canvas text-ink">
      {backdrop}
      <LiveRefresh />
      {/* Десктоп-сайдбар / мобильная шторка */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 border-r border-line bg-surface/95 backdrop-blur-xl transition-[transform,width] duration-200 ease-out",
          "w-[84vw] max-w-[20rem]",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          "lg:sticky lg:top-0 lg:z-30 lg:h-dvh lg:translate-x-0 lg:shadow-none",
          collapsed ? "lg:w-[4.75rem]" : "lg:w-64",
        )}
        style={{ paddingTop: "max(env(safe-area-inset-top), var(--tg-top))" }}
      >
        {sidebar}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Закрыть меню"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted lg:hidden"
        >
          <Icon path={I.close} />
        </button>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Контент */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-20 flex items-center gap-2 border-b border-line/80 bg-surface/80 px-3 py-2 backdrop-blur-xl"
          style={{ paddingTop: "max(env(safe-area-inset-top), var(--tg-top))" }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Открыть меню"
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted lg:hidden"
          >
            <Icon path={I.menu} />
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Назад"
              className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <Icon path={I.back} />
            </button>
            <button
              type="button"
              onClick={() => router.forward()}
              aria-label="Вперёд"
              className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <Icon path={I.forward} />
            </button>
          </div>
          <div className="ml-1 flex items-center gap-2 lg:hidden">
            <BrandMark size={24} />
            <span className="text-sm font-semibold text-ink">Кафетерий льгот</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/profile"
              aria-label="Профиль"
              className={cx(
                "flex h-9 w-9 items-center justify-center rounded-full border border-line transition-colors",
                isActive("/profile")
                  ? "bg-primary text-on-brand"
                  : "bg-surface text-ink-muted hover:text-ink",
              )}
            >
              <Icon path={I.profile} />
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-12 sm:pt-5 sm:pb-16">
          <div key={pathname} className="animate-page">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
