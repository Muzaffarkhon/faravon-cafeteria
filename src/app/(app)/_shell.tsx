"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { cx } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LanguageInlineOptions } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Locale } from "@/lib/i18n/shared";
import { translate } from "@/lib/i18n/dict";
import { formatSomoni } from "@/lib/cashback-math";
import { ICONS } from "./_nav";
import { logout } from "./actions";
import { LiveRefresh } from "./_live-refresh";

export type NavItem = {
  href: string;
  label: string;
  /** Подпись для плиток «Кабинета»; в меню шапки не показывается. */
  desc?: string;
  icon: string; // path(s) для 24×24 stroke-иконки, сегменты через "||"
  badge?: number;
  soon?: boolean;
  /** Подпункты, раскрываемые стрелочкой в левом меню админки (см. AdminShell). */
  children?: { href: string; label: string }[];
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
  admin: "M4 21V8l8-5 8 5v13||M9 21v-6h6v6",
};

/** Значок Farovon Coin — золотая монета с фирменным знаком вместо кубка (ICONS.gamification). */
function CoinBadge() {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full border"
      style={{
        borderColor: "#c98d1a",
        background: "radial-gradient(circle at 32% 28%, #fff3c4 0%, #f3c94a 32%, #d89b1f 68%, #a9740f 100%)",
        boxShadow: "inset 0 1px 1px rgba(255,255,255,.8), inset 0 -1.5px 2px rgba(120,70,0,.55)",
      }}
    >
      <BrandMark size={11} className="[filter:drop-shadow(0_1px_0_rgba(255,255,255,.65))_drop-shadow(0_-0.5px_0.5px_rgba(120,60,0,.5))]" />
    </span>
  );
}

/** Иконка колеса подарков: обод, 8 спиц и ступица. */
function WheelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 2.8v18.4M2.8 12h18.4M5.5 5.5l13 13M18.5 5.5l-13 13" strokeWidth="1.3" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** «Рабочие» группы идут прямыми вкладками, остальное — в меню «Ещё». */
const PRIMARY_GROUPS = new Set(["cabinet", "work"]);

export function AppShell({
  groups,
  roleLabel,
  displayName,
  selectionStat,
  coinBalance,
  cashbackTotal,
  wheel,
  backdrop,
  adminHref,
  locale,
  sseEnabled = false,
  children,
}: {
  groups: NavGroup[];
  roleLabel: string;
  /** «Фамилия И.» (или логин) — рядом с кнопкой профиля. */
  displayName?: string;
  /** Счётчики выбора льгот в закреплённой шапке (только у сотрудника). */
  selectionStat?: { used: number; drafts: number; max: number } | null;
  /** Баланс Farovon Coin в шапке — только если геймификация включена. */
  coinBalance?: number | null;
  /** Совокупный кешбек по всем партнёрам (диры) — только если есть счета кешбека. */
  cashbackTotal?: number | null;
  /** Колесо подарков включено — кнопка в шапке; available — сегодня ещё не крутил. */
  wheel?: { href: string; available: boolean } | null;
  /** Ambient-слой (лепестки и т.п.) — рендерится за контентом. */
  backdrop?: React.ReactNode;
  /** Есть доступ хоть к одному разделу админки — ссылка в меню профиля. */
  adminHref?: string;
  locale?: Locale;
  /** Включать ли постоянный SSE-поток (/api/stream). Только для C&B и кассиров-подрядчиков. */
  sseEnabled?: boolean;
  children: React.ReactNode;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale ?? "ru", key);
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, startLogout] = useTransition();
  const navScrollRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  // «Скоро»-пункты (пока не запущенные разделы, напр. геймификация) не
  // занимают место в и так тесной строке вкладок — уходят в «Ещё». Иначе при
  // достаточном числе вкладок такой пункт просто обрезался прокруткой без
  // всякого намёка, что он там есть.
  const primaryGroups = groups.filter((g) => PRIMARY_GROUPS.has(g.id));
  const primaryAll: NavItem[] = primaryGroups.flatMap((g) => g.items);
  const primary = primaryAll.filter((it) => !it.soon);
  const soonItems = primaryAll.filter((it) => it.soon);
  const moreGroups: NavGroup[] = groups.filter((g) => !PRIMARY_GROUPS.has(g.id));
  if (soonItems.length > 0) {
    moreGroups.push({ id: "soon", label: t("nav.soon"), items: soonItems });
  }
  const moreItems = moreGroups.flatMap((g) => g.items);
  const moreActive = moreItems.some((it) => isActive(it.href));
  const moreBadge = moreItems.reduce((n, it) => n + (it.badge ?? 0), 0);

  // Нижняя навигация (мобайл) вмещает не более 5 вкладок (включая «Ещё») —
  // без подписей под иконками (см. рендер ниже) 5 иконок помещаются в ряд
  // даже на узких экранах. Раньше лимит был 4, из-за чего «Геймификация»,
  // пятый пункт «Кабинета», была недостижима на мобильном без «Ещё».
  // На десктопе такой проблемы нет — там вкладки не обрезаются (прокрутка).
  const BOTTOM_TAB_LIMIT = 5;
  const bottomReservesMoreSlot = moreGroups.length > 0 || primary.length > BOTTOM_TAB_LIMIT;
  const bottomPrimary = primary.slice(0, bottomReservesMoreSlot ? BOTTOM_TAB_LIMIT - 1 : BOTTOM_TAB_LIMIT);
  const bottomOverflow = primary.slice(bottomPrimary.length);
  const mobileMoreGroups: NavGroup[] =
    bottomOverflow.length === 0
      ? moreGroups
      : [
          ...primaryGroups
            .map((g) => ({ ...g, items: g.items.filter((it) => bottomOverflow.includes(it)) }))
            .filter((g) => g.items.length > 0),
          ...moreGroups,
        ];
  const mobileMoreActive = mobileMoreGroups.flatMap((g) => g.items).some((it) => isActive(it.href));
  const mobileMoreBadge = mobileMoreGroups.flatMap((g) => g.items).reduce((n, it) => n + (it.badge ?? 0), 0);

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
      // min-h-11 — тач-таргет по HIG (44pt) поверх компактной строки вкладок.
      "flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-bold transition-colors",
      active
        ? "bg-primary text-on-brand"
        : "text-ink hover:bg-surface-muted",
    );

  // Вкладки шапки — квадратные кнопки только с иконкой (44×44, тач-таргет по
  // HIG), подпись — во всплывающей подсказке (title) и для скринридера
  // (aria-label), не в самой кнопке: раньше 5 текстовых вкладок не помещались
  // на средних экранах и обрезались молча (см. жалобу на «Ген» от «Геймификация»).
  const iconTab = (active: boolean) =>
    cx(
      "relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[11px] transition-colors",
      active ? "bg-primary text-on-brand" : "text-ink hover:bg-surface-muted",
    );

  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-canvas text-ink">
      {backdrop}
      <LiveRefresh sse={sseEnabled} />

      {/* ── Верхняя навигация (десктоп + планшет) ── */}
      <header
        className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur"
        style={{ paddingTop: "max(env(safe-area-inset-top), var(--tg-top))" }}
      >
        {/* Без потолка ширины — иначе на широких экранах строка вкладок
            зажата в 1152px и урезает пункты («Обратная связь» → «Обра»),
            хотя справа и слева пусто. */}
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
          <Link href="/" className="mr-1 flex shrink-0 items-center gap-2" aria-label="На главную">
            <BrandMark size={26} priority />
            <span className="hidden font-display text-[15px] font-bold text-ink sm:block">
              Кафетерий&nbsp;льгот
            </span>
          </Link>

          {/* Прокручиваемая лента вкладок — на мобильном те же разделы уже есть
              внизу (нижняя навигация, sm:hidden), так что здесь скрываем её и
              отдаём место счётчикам/языку/профилю, которые иначе обрезались. */}
          <div
            ref={navScrollRef}
            className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex"
          >
            {primary.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={closeMenus}
                  className={iconTab(active)}
                  aria-current={active ? "page" : undefined}
                  title={it.label}
                  aria-label={it.label}
                >
                  <Icon path={it.icon} />
                  {it.badge ? (
                    // Полностью внутри кнопки (top-0.5/right-0.5, без отрицательных
                    // отступов) — у ленты вкладок overflow-x-auto, из-за чего браузер
                    // сам включает overflow-y:auto (см. комментарий про «Ещё» ниже),
                    // и бейдж с отрицательным сдвигом обрезался бы этим контейнером сверху.
                    <span className="absolute right-0.5 top-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-on-brand tabular-nums">
                      {it.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>

          {/* На мобильном лента вкладок скрыта — эта «распорка» прижимает счётчики, «Ещё» и профиль
              вправо. Без неё они липнут к логотипу слева, и выпадающие меню (right-0) уезжают за левый край экрана. */}
          <div className="min-w-0 flex-1 sm:hidden" aria-hidden="true" />

          {/* Счётчики — в один ряд с вкладками, справа. Выбор льгот теперь один
              единый значок (было 2 отдельных — «выбрано» и «черновики»),
              рядом баланс монет и совокупный кешбек, если они у сотрудника есть. */}
          {wheel && (
            <Link
              href={wheel.href}
              onClick={closeMenus}
              aria-label={wheel.available ? `${t("wheel.title")} — ${t("wheel.availableToday")}` : t("wheel.title")}
              title={t("wheel.title")}
              aria-current={isActive(wheel.href) ? "page" : undefined}
              className={cx(
                "group/wheel relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-bold transition-colors",
                isActive(wheel.href) ? "bg-primary text-on-brand" : "bg-primary-soft text-primary-strong hover:bg-primary-soft-hover",
              )}
            >
              <WheelIcon className="h-5 w-5 transition-transform duration-700 ease-out group-hover/wheel:rotate-180 motion-reduce:transition-none" />
              <span className="hidden whitespace-nowrap lg:inline">{t("wheel.title")}</span>
              {wheel.available && !isActive(wheel.href) && (
                <span className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-surface" aria-hidden="true" />
              )}
            </Link>
          )}

          {/* Кошелёк — раньше 3 отдельные плашки подряд («выбор», монеты, кешбек),
              каждая со своей рамкой/паддингом; собраны в одну с тонкими
              разделителями между тем, что реально показывается. */}
          {(selectionStat || typeof coinBalance === "number" || (typeof cashbackTotal === "number" && cashbackTotal > 0)) && (
            <div className="flex shrink-0 items-center divide-x divide-primary-strong/15 rounded-[10px] bg-primary-soft px-1">
              {selectionStat && (
                <span
                  className="flex items-center px-2 py-1.5 text-[13px] font-bold tabular-nums text-primary-strong"
                  aria-label={
                    selectionStat.drafts > 0
                      ? `${t("shell.selected")}: ${selectionStat.used}/${selectionStat.max}, ${t("shell.drafts")}: ${selectionStat.drafts}`
                      : `${t("shell.selected")}: ${selectionStat.used}/${selectionStat.max}`
                  }
                >
                  <span className="mr-1 hidden text-[11px] font-bold uppercase tracking-[0.08em] text-primary-strong/70 md:inline">
                    {t("shell.selected")}
                  </span>
                  {selectionStat.used}/{selectionStat.max}
                  {selectionStat.drafts > 0 && <span className="text-primary-strong/70"> · {selectionStat.drafts}</span>}
                </span>
              )}
              {typeof coinBalance === "number" && (
                <span
                  className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] font-bold tabular-nums text-primary-strong"
                  aria-label={`${t("gamification.coinUnit")}: ${coinBalance}`}
                  title={t("gamification.coinUnit")}
                >
                  <CoinBadge />
                  {coinBalance}
                </span>
              )}
              {typeof cashbackTotal === "number" && cashbackTotal > 0 && (
                <span
                  className="flex items-center gap-1 px-2 py-1.5 text-[13px] font-bold tabular-nums text-success-strong"
                  aria-label={`${t("cashback.title")}: ${formatSomoni(cashbackTotal)} ${t("cashback.currency")}`}
                  title={t("cashback.title")}
                >
                  <Icon path={ICONS.cashback} className="h-4 w-4" />
                  {formatSomoni(cashbackTotal)}
                </span>
              )}
            </div>
          )}

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
                <span>{t("nav.more")}</span>
                {moreBadge > 0 && !moreOpen && (
                  <span className="ml-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold leading-none text-on-brand tabular-nums">
                    {moreBadge}
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
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-lg">
                    {moreGroups.map((g) => (
                      <div key={g.id} className="mb-1 last:mb-0">
                        <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">
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
                                <span className="inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold leading-none text-on-brand tabular-nums">
                                  {it.badge}
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

          {/* Профиль — тема и язык переехали внутрь меню профиля (ниже), в
              самой шапке от них остались только имя и аватар. */}
          <div className="relative flex shrink-0 items-center gap-2" onMouseLeave={() => setProfileOpen(false)}>
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
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-52 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                  <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
                    <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                    {roleLabel}
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-line-subtle px-3 py-2.5">
                    <span className="text-sm font-semibold text-ink">{t("shell.theme")}</span>
                    <ThemeToggle compact />
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-line-subtle px-3 py-2.5">
                    <span className="text-sm font-semibold text-ink">{t("shell.language")}</span>
                    <LanguageInlineOptions locale={locale ?? "ru"} layout="row" />
                  </div>
                  <Link
                    href="/profile"
                    onClick={closeMenus}
                    className="flex items-center gap-2.5 px-3 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
                  >
                    <Icon path={I.profile} className="h-5 w-5" />
                    {t("shell.profile")}
                  </Link>
                  {adminHref && (
                    <Link
                      href={adminHref}
                      onClick={closeMenus}
                      className="flex items-center gap-2.5 px-3 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
                    >
                      <Icon path={I.admin} className="h-5 w-5" />
                      {t("shell.adminPanel")}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => setLogoutOpen(true)}
                    className="flex w-full items-center gap-2.5 px-3 py-3 text-sm font-semibold text-ink transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <Icon path={I.logout} className="h-5 w-5" />
                    {t("shell.logout")}
                  </button>
                  <ConfirmDialog
                    open={logoutOpen}
                    tone="danger"
                    busy={loggingOut}
                    title={t("shell.logoutConfirm")}
                    confirmLabel={t("shell.logout")}
                    onConfirm={() => startLogout(logout)}
                    onClose={() => setLogoutOpen(false)}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Полоса заполнения выбора льгот — по нижней кромке шапки. */}
        {selectionStat && selectionStat.max > 0 && (
          <div className="h-[3px] w-full bg-primary-soft" aria-hidden="true">
            <div
              className="h-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(100, (selectionStat.used / selectionStat.max) * 100)}%` }}
            />
          </div>
        )}
      </header>

      {/* ── Контент ── */}
      {/* Широкие реестры (много колонок) помечают свой корень `data-wide` и
          получают всю доступную ширину — остальные страницы остаются
          читаемой колонкой в max-w-6xl. Верхняя навигация уже отделяет
          контент от края экрана, так что сами отступы страницы — минимум
          6px по бокам и снизу (сверху — запас под шапку). */}
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-1.5 pb-1.5 pt-5 has-[[data-wide]]:max-w-none">
        <div key={pathname} className="animate-page">
          {children}
        </div>
      </main>

      {/* ── Нижняя навигация (мобайл) ── */}
      <nav
        className="sticky bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {bottomPrimary.map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={closeMenus}
              title={it.label}
              aria-label={it.label}
              className={cx(
                "relative flex flex-1 items-center justify-center py-3 transition-colors",
                active ? "text-primary" : "text-ink-muted",
              )}
            >
              <Icon path={it.icon} className="h-6 w-6" />
              <span className="sr-only">{it.label}</span>
              {it.badge ? (
                <span className="absolute right-[28%] top-2 h-1.5 w-1.5 rounded-full bg-primary" />
              ) : null}
            </Link>
          );
        })}
        {mobileMoreGroups.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            title={t("nav.more")}
            aria-label={t("nav.more")}
            className={cx(
              "relative flex flex-1 cursor-pointer items-center justify-center py-3 transition-colors",
              mobileMoreActive || moreOpen ? "text-primary" : "text-ink-muted",
            )}
          >
            <Icon path={I.more} className="h-6 w-6" />
            <span className="sr-only">{t("nav.more")}</span>
            {mobileMoreBadge > 0 && <span className="absolute right-[34%] top-2 h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        )}
      </nav>

      {/* ── Мобильный лист «Ещё» ── */}
      {moreOpen && mobileMoreGroups.length > 0 && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
            {mobileMoreGroups.map((g) => (
              <div key={g.id} className="mb-3 last:mb-0">
                <div className="px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">
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
                          <span className="inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold leading-none text-on-brand tabular-nums">
                            {it.badge}
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

      {/* ── Быстрая прокрутка наверх / вниз ── */}
      <ScrollNav />
    </div>
  );
}

function ScrollNav() {
  const [state, setState] = useState({
    canScrollUp: false,
    canScrollDown: false,
    hasScroll: false,
  });

  useEffect(() => {
    const update = () => {
      const el = document.documentElement;
      const scrollTop = window.scrollY || el.scrollTop || 0;
      const scrollHeight = el.scrollHeight || 0;
      const clientHeight = window.innerHeight || el.clientHeight || 0;
      const hasScroll = scrollHeight > clientHeight + 120;
      const canScrollUp = scrollTop > 100;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 100;
      setState({ canScrollUp, canScrollDown, hasScroll });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(document.body);
    }

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);

  if (!state.hasScroll) return null;

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToBottom = () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  };

  return (
    <div
      // Слева, а не справа — справа снизу иногда всплывает панель подтверждения выбора
      // (flex-selection.tsx), и обе плавающие кнопки садились в один угол одна на другую.
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-3.5 z-30 flex flex-col gap-1 rounded-full border border-line bg-surface/90 p-1 shadow-lg backdrop-blur-md transition-opacity sm:bottom-6 sm:left-6"
      role="navigation"
      aria-label="Быстрая навигация по странице"
    >
      <button
        type="button"
        onClick={scrollToTop}
        disabled={!state.canScrollUp}
        aria-label="Наверх страницы"
        className={cx(
          "flex h-8 w-8 items-center justify-center rounded-full transition-all sm:h-9 sm:w-9",
          state.canScrollUp
            ? "text-ink hover:bg-surface-muted active:scale-95"
            : "cursor-default text-ink-subtle/30 opacity-30",
        )}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>
      <div className="mx-auto h-px w-4 bg-line" />
      <button
        type="button"
        onClick={scrollToBottom}
        disabled={!state.canScrollDown}
        aria-label="Вниз страницы"
        className={cx(
          "flex h-8 w-8 items-center justify-center rounded-full transition-all sm:h-9 sm:w-9",
          state.canScrollDown
            ? "text-ink hover:bg-surface-muted active:scale-95"
            : "cursor-default text-ink-subtle/30 opacity-30",
        )}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}
