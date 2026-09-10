"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { cx } from "@/components/ui";
import { logout } from "./actions";
import { LiveRefresh } from "./_live-refresh";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // path(s) для 24×24 stroke-иконки, сегменты через "||"
  badge?: number;
  soon?: boolean;
};
export type NavGroup = { id: string; label: string; items: NavItem[] };

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
  chevron: "M6 9l6 6 6-6",
  profile: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z||M4 21v-1a8 8 0 0 1 16 0v1",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4||M16 17l5-5-5-5||M21 12H9",
  more: "M4 6h16M4 12h16M4 18h16",
};

/** «Рабочие» группы идут прямыми вкладками, остальное — в меню «Ещё». */
const PRIMARY_GROUPS = new Set(["cabinet", "work"]);

export function AppShell({
  groups,
  roleLabel,
  backdrop,
  children,
}: {
  groups: NavGroup[];
  roleLabel: string;
  /** Ambient-слой (лепестки и т.п.) — рендерится за контентом. */
  backdrop?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navScrollRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const primary: NavItem[] = groups
    .filter((g) => PRIMARY_GROUPS.has(g.id))
    .flatMap((g) => g.items);
  const moreGroups: NavGroup[] = groups.filter((g) => !PRIMARY_GROUPS.has(g.id));
  const moreItems = moreGroups.flatMap((g) => g.items);
  const moreActive = moreItems.some((it) => isActive(it.href));
  const moreBadge = moreItems.reduce((n, it) => n + (it.badge ?? 0), 0);

  const closeMenus = () => {
    setMoreOpen(false);
    setProfileOpen(false);
  };

  // Закрыть выпадашки по Esc
  useEffect(() => {
    if (!moreOpen && !profileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMoreOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen, profileOpen]);

  const pill = (active: boolean) =>
    cx(
      "flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-bold transition-colors",
      active
        ? "bg-primary text-on-brand"
        : "text-ink hover:bg-surface-muted",
    );

  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-canvas text-ink">
      {backdrop}
      <LiveRefresh />

      {/* ── Верхняя навигация (десктоп + планшет) ── */}
      <header
        className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur"
        style={{ paddingTop: "max(env(safe-area-inset-top), var(--tg-top))" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-4">
          <Link href="/" className="mr-1 flex shrink-0 items-center gap-2" aria-label="На главную">
            <BrandMark size={26} priority />
            <span className="hidden font-display text-[15px] font-bold text-ink sm:block">
              Кафетерий&nbsp;льгот
            </span>
          </Link>

          {/* Прокручиваемая лента вкладок */}
          <div
            ref={navScrollRef}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {primary.map((it) => {
              const active = isActive(it.href);
              return (
                <Link key={it.href} href={it.href} onClick={closeMenus} className={pill(active)} aria-current={active ? "page" : undefined}>
                  <Icon path={it.icon} />
                  <span className="whitespace-nowrap">{it.label}</span>
                  {it.badge ? (
                    <span className="ml-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-on-brand/25 px-1 text-[11px] font-bold leading-none tabular-nums">
                      {it.badge > 99 ? "99+" : it.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>

          {/* «Ещё» — вне скроллящейся ленты: overflow-x-auto у соседа неявно
              выставляет и overflow-y:auto (правило CSS для перпендикулярной
              оси), из-за чего выпадающий список внутри просто обрезался. */}
          {moreGroups.length > 0 && (
            <div className="relative shrink-0" onMouseLeave={() => setMoreOpen(false)}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                className={pill(moreActive || moreOpen)}
              >
                <Icon path={I.more} />
                <span>Ещё</span>
                {moreBadge > 0 && !moreOpen && (
                  <span className="ml-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-none text-on-brand tabular-nums">
                    {moreBadge > 99 ? "99+" : moreBadge}
                  </span>
                )}
              </button>
              {moreOpen && (
                <>
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setMoreOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] w-64 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-lg">
                    {moreGroups.map((g) => (
                      <div key={g.id} className="mb-1 last:mb-0">
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-muted">
                          {g.label}
                        </div>
                        {g.items.map((it) => {
                          const active = isActive(it.href);
                          return (
                            <Link
                              key={it.href}
                              href={it.href}
                              onClick={closeMenus}
                              className={cx(
                                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors",
                                active ? "bg-primary-soft text-primary-strong" : "text-ink hover:bg-surface-muted",
                              )}
                            >
                              <Icon path={it.icon} className="shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{it.label}</span>
                              {it.badge ? (
                                <span className="inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-none text-on-brand tabular-nums">
                                  {it.badge > 99 ? "99+" : it.badge}
                                </span>
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Профиль */}
          <div className="relative shrink-0" onMouseLeave={() => setProfileOpen(false)}>
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              aria-label="Меню профиля"
              aria-expanded={profileOpen}
              className={cx(
                "flex h-9 w-9 items-center justify-center rounded-full border border-line transition-colors",
                isActive("/profile") || profileOpen
                  ? "bg-primary text-on-brand"
                  : "bg-surface text-ink hover:bg-surface-muted",
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
                  <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                    <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                    {roleLabel}
                  </div>
                  <Link
                    href="/profile"
                    onClick={closeMenus}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
                  >
                    <Icon path={I.profile} />
                    Профиль
                  </Link>
                  <form action={logout}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Icon path={I.logout} />
                      Выйти
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Контент ── */}
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:pb-16">
        <div key={pathname} className="animate-page">
          {children}
        </div>
      </main>

      {/* ── Нижняя навигация (мобайл) ── */}
      <nav
        className="sticky bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primary.slice(0, moreGroups.length > 0 ? 3 : 4).map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={closeMenus}
              className={cx(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition-colors",
                active ? "text-primary" : "text-ink-muted",
              )}
            >
              <Icon path={it.icon} className="h-5 w-5" />
              <span className="max-w-full truncate px-1">{it.label}</span>
              {it.badge ? (
                <span className="absolute right-[22%] top-1 h-1.5 w-1.5 rounded-full bg-primary" />
              ) : null}
            </Link>
          );
        })}
        {moreGroups.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={cx(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition-colors",
              moreActive || moreOpen ? "text-primary" : "text-ink-muted",
            )}
          >
            <Icon path={I.more} className="h-5 w-5" />
            <span>Ещё</span>
            {moreBadge > 0 && <span className="absolute right-[28%] top-1 h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        )}
      </nav>

      {/* ── Мобильный лист «Ещё» ── */}
      {moreOpen && moreGroups.length > 0 && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
            {moreGroups.map((g) => (
              <div key={g.id} className="mb-3 last:mb-0">
                <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-muted">
                  {g.label}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {g.items.map((it) => {
                    const active = isActive(it.href);
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        onClick={closeMenus}
                        className={cx(
                          "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                          active
                            ? "border-primary-border bg-primary-soft text-primary-strong"
                            : "border-line bg-surface text-ink hover:bg-surface-muted",
                        )}
                      >
                        <Icon path={it.icon} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{it.label}</span>
                        {it.badge ? (
                          <span className="inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-none text-on-brand tabular-nums">
                            {it.badge > 99 ? "99+" : it.badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
