"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { cx } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Locale } from "@/lib/i18n/shared";
import { translate } from "@/lib/i18n/dict";
import { logout } from "@/app/(app)/actions";
import type { NavGroup, NavItem } from "@/app/(app)/_shell";

function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
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
  profile: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z||M4 21v-1a8 8 0 0 1 16 0v1",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4||M16 17l5-5-5-5||M21 12H9",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M18 6L6 18||M6 6l12 12",
  collapse: "M15 6l-6 6 6 6",
  expand: "M9 6l6 6-6 6",
  back: "M15 18l-6-6 6-6",
};

const SIDEBAR_COLLAPSED_KEY = "faravon.admin.sidebarCollapsed";
const NAV_ORDER_KEY = "faravon.admin.navOrder"; // { [groupId]: href[] } — порядок, который перетащил себе пользователь

function loadNavOrder(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(NAV_ORDER_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

/** Применяет сохранённый пользователем порядок; новые/неизвестные пункты остаются в исходном месте. */
function applyOrder(items: NavItem[], saved: string[] | undefined): NavItem[] {
  if (!saved?.length) return items;
  const byHref = new Map(items.map((it) => [it.href, it]));
  const ordered = saved.map((h) => byHref.get(h)).filter((it): it is NavItem => !!it);
  const rest = items.filter((it) => !saved.includes(it.href));
  return [...ordered, ...rest];
}

const DRAG_HANDLE_ICON = "M8 6h.01||M8 12h.01||M8 18h.01||M16 6h.01||M16 12h.01||M16 18h.01";

export function AdminShell({
  groups,
  roleLabel,
  displayName,
  locale,
  children,
}: {
  groups: NavGroup[];
  roleLabel: string;
  displayName?: string;
  locale?: Locale;
  children: React.ReactNode;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale ?? "ru", key);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [navOrder, setNavOrder] = useState<Record<string, string[]>>({});
  const [dragHref, setDragHref] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* localStorage недоступен — остаёмся развёрнутыми */
    }
    setNavOrder(loadNavOrder());
    setHydrated(true);
  }, []);

  function reorder(groupId: string, items: NavItem[], fromHref: string, toHref: string) {
    if (fromHref === toHref) return;
    const hrefs = items.map((it) => it.href);
    const from = hrefs.indexOf(fromHref);
    const to = hrefs.indexOf(toHref);
    if (from === -1 || to === -1) return;
    hrefs.splice(to, 0, hrefs.splice(from, 1)[0]);
    const next = { ...navOrder, [groupId]: hrefs };
    setNavOrder(next);
    try {
      localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(next));
    } catch {
      /* не критично — порядок просто не переживёт перезагрузку */
    }
  }

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* не критично */
      }
      return next;
    });
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const allItems: NavItem[] = groups.flatMap((g) => g.items);
  const activeItem = allItems.find((it) => isActive(it.href));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh items-start bg-canvas text-ink">
      {/* Мобильный хедер с гамбургером — сама навигация вне потока (drawer). */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface px-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Открыть меню"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-surface-muted"
        >
          <Icon path={I.menu} />
        </button>
        <span className="truncate text-sm font-bold text-ink">{activeItem?.label ?? t("shell.adminPanel")}</span>
      </div>

      {/* Затемнение под мобильным drawer'ом */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Закрыть меню"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-ink/40 md:hidden"
        />
      )}

      {/* ── Левое меню: fixed-drawer на мобильном, sticky-колонка на десктопе ── */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 ease-in-out",
          // На десктопе — sticky top-0 с высотой ровно во весь экран
          // (h-dvh), а не self-stretch по высоте строки: в этом браузере
          // (Chromium) sticky не работает на flex-элементе, чья высота
          // вычисляется через align-self/stretch — растянутая высота ломает
          // позиционирование, и меню просто уезжает вместе со страницей.
          "md:sticky md:top-0 md:z-auto md:translate-x-0 md:transition-[width]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-16" : "md:w-64",
          !hydrated && "md:transition-none",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2" aria-label="На витрину">
            <BrandMark size={24} priority />
            {!collapsed && (
              <span className="truncate font-display text-[14px] font-bold text-ink">Админ-панель</span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Закрыть меню"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted md:hidden"
          >
            <Icon path={I.close} />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {groups.map((g) => {
            const items = applyOrder(g.items, navOrder[g.id]);
            return (
              <div key={g.id}>
                {!collapsed && (
                  <div className="px-2.5 pb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">
                    {g.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {items.map((it) => {
                    const active = isActive(it.href);
                    const hasChildren = !!it.children?.length;
                    const childActive = !!it.children?.some((c) => isActive(c.href));
                    const open = !collapsed && hasChildren && (expanded.has(it.href) || childActive);
                    return (
                      <div key={it.href}>
                        <div
                          className={cx(
                            "group/nav flex items-center rounded-lg transition-colors",
                            !collapsed && dragHref && dragHref !== it.href && "border-t-2 border-transparent",
                          )}
                          onDragOver={(e) => !collapsed && e.preventDefault()}
                          onDrop={(e) => {
                            if (collapsed || !dragHref) return;
                            e.preventDefault();
                            reorder(g.id, items, dragHref, it.href);
                            setDragHref(null);
                          }}
                        >
                          {!collapsed && (
                            <button
                              type="button"
                              draggable
                              onDragStart={() => setDragHref(it.href)}
                              onDragEnd={() => setDragHref(null)}
                              aria-label="Перетащить, чтобы изменить порядок"
                              className="hidden shrink-0 cursor-grab touch-none px-1 py-2 text-ink-subtle opacity-0 transition-opacity group-hover/nav:opacity-100 active:cursor-grabbing md:block"
                            >
                              <Icon path={DRAG_HANDLE_ICON} className="pointer-events-none" />
                            </button>
                          )}
                          <Link
                            href={it.href}
                            title={collapsed ? it.label : undefined}
                            className={cx(
                              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors",
                              collapsed && "justify-center",
                              active ? "bg-primary text-on-brand" : "text-ink hover:bg-surface-muted",
                            )}
                            aria-current={active ? "page" : undefined}
                          >
                            <Icon path={it.icon} className="shrink-0" />
                            {!collapsed && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
                            {it.badge ? (
                              <span
                                className={cx(
                                  "inline-flex min-w-[1.05rem] items-center justify-center rounded-full px-1 text-xs font-bold leading-none tabular-nums",
                                  active ? "bg-on-brand/25 text-on-brand" : "bg-primary text-on-brand",
                                  collapsed && "absolute ml-5 mt-[-14px]",
                                )}
                              >
                                {it.badge}
                              </span>
                            ) : null}
                          </Link>
                          {!collapsed && hasChildren && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((cur) => {
                                  const next = new Set(cur);
                                  if (next.has(it.href)) next.delete(it.href);
                                  else next.add(it.href);
                                  return next;
                                })
                              }
                              aria-label={open ? t("shell.collapseSubmenu") : t("shell.expandSubmenu")}
                              aria-expanded={open}
                              className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-subtle transition hover:text-ink"
                            >
                              <Icon
                                path={I.back}
                                className={cx("transition-transform", open ? "-rotate-90" : "rotate-180")}
                              />
                            </button>
                          )}
                        </div>
                        {open && (
                          <div className="ml-6 mt-1 space-y-0.5 border-l border-line-subtle pl-2.5">
                            {it.children!.map((c) => {
                              const childIsActive = isActive(c.href);
                              return (
                                <Link
                                  key={c.href}
                                  href={c.href}
                                  className={cx(
                                    "block truncate rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                                    childIsActive ? "bg-primary text-on-brand" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                                  )}
                                  aria-current={childIsActive ? "page" : undefined}
                                >
                                  {c.label}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-line p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-surface-muted md:flex"
          >
            <Icon path={collapsed ? I.expand : I.collapse} />
            {!collapsed && t("shell.collapseMenu")}
          </button>
        </div>
      </aside>

      {/* ── Правая колонка: закреплённая шапка + прокручиваемый контент ── */}
      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <header className="sticky top-0 z-20 hidden h-14 shrink-0 items-center justify-between border-b border-line bg-surface/95 px-5 backdrop-blur md:flex">
          <span className="truncate text-[15px] font-bold text-ink">{activeItem?.label ?? t("shell.adminPanel")}</span>

          <div className="relative flex shrink-0 items-center gap-2" onMouseLeave={() => setProfileOpen(false)}>
            <ThemeToggle compact />
            <LanguageSwitcher locale={locale ?? "ru"} />
            {displayName && (
              <span className="hidden max-w-[10rem] truncate text-[13px] font-semibold text-ink sm:inline">
                {displayName}
              </span>
            )}
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              aria-label="Меню профиля"
              aria-expanded={profileOpen}
              className={cx(
                "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line transition-colors",
                profileOpen ? "bg-primary text-on-brand" : "bg-surface text-ink hover:bg-surface-muted",
              )}
            >
              <Icon path={I.profile} />
            </button>
            {profileOpen && (
              <>
                <button
                  type="button"
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => setProfileOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                  <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
                    <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                    {roleLabel}
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
                  >
                    <Icon path={I.profile} />
                    {t("shell.profile")}
                  </Link>
                  <form action={logout}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Icon path={I.logout} />
                      {t("shell.logout")}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Левое меню и шапка уже отделяют контент от края экрана — сами по
            себе отступы страницы были избыточны и «резали» широкие таблицы.
            Минимум 6px слева/справа/снизу, сверху оставлен запас под шапку. */}
        <main className="relative px-1.5 pb-1.5 pt-4 sm:pt-6">
          <div key={pathname} className="animate-page mx-auto w-full max-w-6xl has-[[data-wide]]:max-w-none">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
