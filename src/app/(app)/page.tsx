import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { getCurrentPeriod, getApplicationWithItems, groupProgress } from "@/lib/selection";
import { Card, SectionTitle, buttonClass } from "@/components/ui";
import { FlexSelection } from "./_components/flex-selection";

export default async function OverviewPage() {
  const session = await getSession();
  const [goal, notice] = await Promise.all([
    db.textBlock.findUnique({ where: { key: "GOAL" } }),
    db.textBlock.findUnique({ where: { key: "NOVELTY_NOTICE" } }),
  ]);

  if (!session?.employee) {
    const roles = session?.roles ?? [];
    const links: { href: string; label: string; desc: string }[] = [];
    if (can(roles, "applications.decide"))
      links.push({ href: "/review", label: "Согласование заявок", desc: "одобрение и отклонение позиций" });
    if (can(roles, "coupons.manage"))
      links.push({ href: "/coupons", label: "Купоны", desc: "формирование и выдача купонов" });
    if (can(roles, "coupons.confirm"))
      links.push({ href: "/provider", label: "Погашение купонов", desc: "проверка и подтверждение купонов сотрудников у партнёра" });
    if (can(roles, "users.manage"))
      links.push({ href: "/admin/users", label: "Пользователи и роли", desc: "справочник сотрудников, учётные записи, роли, деактивация" });
    if (can(roles, "access.manage"))
      links.push({ href: "/admin/access", label: "Доступ сотрудников", desc: "коды идентификации для Telegram-бота, привязка Telegram" });
    if (can(roles, "cards.manage"))
      links.push({ href: "/admin/cards", label: "Карточки", desc: "программы признания, витрина заботы, реестр гибких льгот" });
    if (can(roles, "partners.manage"))
      links.push({ href: "/admin/partners", label: "Справочник партнёров", desc: "организации-провайдеры льгот" });
    if (can(roles, "cards.manage"))
      links.push({ href: "/admin/texts", label: "Текстовые блоки", desc: "«Цель программы» и уведомление о новизне" });
    if (can(roles, "periods.manage"))
      links.push({ href: "/admin/periods", label: "Периоды выбора", desc: "окна подачи заявок, лимит, открытие и закрытие" });
    if (can(roles, "reports.view"))
      links.push({ href: "/admin/reports", label: "Отчёты и метрики", desc: "активация, вовлечение, конверсия, топ льгот, экспорт XLSX" });

    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Панель управления
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
            Вы вошли как {roles.map((r) => ROLE_LABELS[r]).join(", ")}
          </h1>
        </div>

        {links.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-ink-muted">
              Разделы для вашей роли (справочники, отчёты) появятся здесь по мере готовности.
            </p>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="group flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary-border hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.9375rem] font-semibold text-ink">{l.label}</div>
                    <p className="mt-1 text-sm leading-6 text-ink-muted">{l.desc}</p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-muted text-ink-muted transition-[transform,background-color,color] duration-200 group-hover:translate-x-0.5 group-hover:bg-primary-soft group-hover:text-primary-strong"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const emp = session.employee;
  const period = await getCurrentPeriod();

  const [recognition, care, flex] = await Promise.all([
    db.benefitCard.findMany({ where: { block: "RECOGNITION", status: "PUBLISHED" }, orderBy: { sortOrder: "asc" } }),
    db.benefitCard.findMany({ where: { block: "CARE", status: "PUBLISHED" }, orderBy: { sortOrder: "asc" } }),
    db.benefitCard.findMany({
      where: { block: "FLEX", status: "PUBLISHED" },
      orderBy: { sortOrder: "asc" },
      include: { partner: true },
    }),
  ]);

  const banners = await db.partnerBanner.findMany({ where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }] }, orderBy: { sortOrder: "asc" } });

  // Баннер партнёра → якорь на его гибкую льготу в списке ниже (активная в приоритете).
  const flexCardByPartner = new Map<string, string>();
  for (const c of flex) if (c.partnerId && c.isActive && !flexCardByPartner.has(c.partnerId)) flexCardByPartner.set(c.partnerId, c.id);
  for (const c of flex) if (c.partnerId && !flexCardByPartner.has(c.partnerId)) flexCardByPartner.set(c.partnerId, c.id);

  const application = period
    ? await getApplicationWithItems(emp.id, period.id)
    : null;
  const items = application?.items ?? [];
  const activeItems = items.filter((i) => !["CANCELLED", "REJECTED"].includes(i.status));
  const selectedIds = activeItems.map((i) => i.cardId);
  const draftCount = items.filter((i) => i.status === "DRAFT").length;

  // Статус позиции по карточке — чтобы показать «уже выбрано / отклонено / в обработке».
  const itemStatusByCard = new Map(items.map((i) => [i.cardId, i.status] as const));
  // Прогресс набора групп для карточек с порогом (§ minParticipants).
  const groupCards = flex.filter((c) => c.minParticipants > 1);
  const groupCount = period
    ? await groupProgress(groupCards.map((c) => c.id), period.id)
    : new Map<string, number>();

  const stats = [
    {
      label: "Выбрано",
      value: `${activeItems.length}/${period?.maxSelections ?? 4}`,
      tone: "brand",
      helper: "льгот в этом периоде",
    },
    {
      label: "Черновики",
      value: String(draftCount),
      tone: "warning",
      helper: draftCount > 0 ? "ожидают подтверждения" : "пустой список",
    },
    {
      label: "Статус",
      value: period?.windowOpen ? "Открыт" : "Закрыт",
      tone: period?.windowOpen ? "success" : "neutral",
      helper: period ? period.name : "нет активного периода",
    },
  ];

  return (
    <div className="space-y-6">
      {banners.length > 0 && (
        <section className="space-y-3">
          {banners.map((b) => {
            const cardId = b.partnerId ? flexCardByPartner.get(b.partnerId) : undefined;
            const cardHref = cardId ? `#card-${cardId}` : undefined;
            const linkHref = cardHref ?? b.href ?? undefined;
            const external = !cardHref && !!b.href && /^https?:\/\//.test(b.href);
            const cta = cardHref ? "Перейти к льготе" : "Подробнее";
            const cardClass =
              "group relative flex h-44 items-end overflow-hidden rounded-[26px] border border-line bg-surface-sunken shadow-md sm:h-56";
            const inner = (
              <>
                {b.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.imageUrl}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/5"
                />
                <div className="absolute left-4 top-4 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur">
                  Партнёр
                </div>
                <div className="relative z-10 max-w-2xl p-5 sm:p-6">
                  <h2 className="text-lg font-semibold leading-tight text-balance text-white sm:text-xl">
                    {b.title}
                  </h2>
                  {b.subtitle && (
                    <p className="mt-1.5 text-sm leading-6 text-white/85 line-clamp-2">{b.subtitle}</p>
                  )}
                  {linkHref && (
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                      {cta}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  )}
                </div>
              </>
            );
            return linkHref ? (
              <a
                key={b.id}
                href={linkHref}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={cardClass}
              >
                {inner}
              </a>
            ) : (
              <div key={b.id} className={cardClass}>
                {inner}
              </div>
            );
          })}
        </section>
      )}
      <section className="rounded-[28px] border border-line bg-surface/90 p-5 shadow-lg shadow-sand-200/40 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-full border border-primary-border bg-primary-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-strong">
              Личный кабинет
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{emp.fullName}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                {emp.position} · {emp.department}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start rounded-2xl border border-line bg-surface-muted px-3 py-2 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-sm font-semibold text-primary-strong">
              {period?.windowOpen ? "✓" : "—"}
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                {period ? "Период" : "Состояние"}
              </div>
              <div className="text-sm font-medium text-ink">
                {period ? period.name : "Активный период не открыт"}
              </div>
              {period && (
                <div className="text-xs text-ink-muted">
                  {period.windowOpen
                    ? `Окно открыто до ${period.windowEnd.toLocaleDateString("ru-RU")}`
                    : "Окно выбора закрыто"}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-line bg-surface-muted/70 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">{stat.label}</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">{stat.value}</div>
              <div className="mt-1 text-xs text-ink-muted">{stat.helper}</div>
            </div>
          ))}
        </div>
      </section>

      {goal && (
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle>{goal.title}</SectionTitle>
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-strong">
              Цель программы
            </span>
          </div>
          <p className="mt-3 text-[0.9375rem] leading-7 text-ink">{goal.content}</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.72fr]">
        <div className="space-y-6">
          <section className="space-y-4">
            <SectionTitle className="text-lg">Программы признания</SectionTitle>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {recognition.map((c) => (
                <li
                  key={c.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:border-primary-border hover:shadow-md"
                >
                  {c.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className="h-32 w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]" loading="lazy" />
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-[1.0625rem] font-semibold leading-snug text-balance text-ink">{c.title}</h3>
                    {c.description && (
                      <p className="mt-2 text-sm leading-6 text-ink-muted line-clamp-3">{c.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4">
            <SectionTitle className="text-lg">Витрина заботы</SectionTitle>
            <ul className="grid gap-5 sm:grid-cols-2">
              {care.map((c) => (
                <li
                  key={c.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:border-primary-border hover:shadow-md"
                >
                  <div className="relative h-44 overflow-hidden">
                    {c.imageUrl ? (
                      <>
                        {/* Размытая рамка — увеличенная копия картинки позади чёткой */}
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 scale-125 bg-cover bg-center blur-2xl saturate-150"
                          style={{ backgroundImage: `url("${c.imageUrl}")` }}
                        />
                        <div aria-hidden="true" className="absolute inset-0 bg-surface/20" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.imageUrl}
                          alt=""
                          loading="lazy"
                          className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] rounded-xl border border-white/40 object-cover shadow-md transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                        />
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary-soft text-primary-strong">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                      Гарантировано всем
                    </p>
                    <p className="mt-1 text-lg font-semibold leading-snug text-balance text-ink">
                      {c.title}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4">
            <SectionTitle className="text-lg">Реестр гибких льгот</SectionTitle>
            <p className="text-sm leading-6 text-ink-muted">
              Выберите до {period?.maxSelections ?? 4} льгот. После подтверждения выбор поступит на согласование.
            </p>
            <FlexSelection
              cards={flex.map((c) => ({
                id: c.id,
                title: c.title,
                condition: c.condition,
                isActive: c.isActive,
                partner: c.partner?.name ?? null,
                imageUrl: c.imageUrl,
                minParticipants: c.minParticipants,
                groupCount: groupCount.get(c.id) ?? 0,
                lockedStatus:
                  itemStatusByCard.get(c.id) && itemStatusByCard.get(c.id) !== "DRAFT"
                    ? (itemStatusByCard.get(c.id) as string)
                    : null,
              }))}
              selectedIds={selectedIds}
              draftCount={draftCount}
              maxSelections={period?.maxSelections ?? 4}
              windowOpen={!!period?.windowOpen}
              hasSubmittable={draftCount > 0}
            />
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <div className="text-sm font-semibold text-ink">Быстрые действия</div>
            <Link
              href="/applications"
              className={buttonClass({ variant: "primary", fullWidth: true, className: "mt-4" })}
            >
              Мои заявки и купоны
            </Link>

            <nav className="mt-5 border-t border-line-subtle pt-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
                Навигация
              </div>
              <ul className="-mx-2 flex flex-col">
                {[
                  {
                    href: "/",
                    label: "Обзор",
                    icon: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
                  },
                  {
                    href: "/applications",
                    label: "Мои заявки и купоны",
                    icon: "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M9 3h6v4H9zM9 12h6M9 16h4",
                  },
                  {
                    href: "/profile",
                    label: "Профиль",
                    icon: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
                  },
                ].map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={l.icon} />
                      </svg>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </Card>

          {notice && (
            <Card className="border-warning-soft bg-warning-soft/70 p-5 shadow-none">
              <div className="text-sm font-semibold text-warning-strong">{notice.title}</div>
              <p className="mt-2 text-sm leading-6 text-warning-strong/80">{notice.content}</p>
            </Card>
          )}

          <Card className="p-5">
            <div className="text-sm font-semibold text-ink">Как работает выбор</div>
            <ol className="mt-3 space-y-2.5 text-sm leading-6 text-ink-muted">
              <li>1. Выберите до лимита льгот.</li>
              <li>2. Сохраните черновик и проверьте детали.</li>
              <li>3. Подтвердите заявку — она уйдёт на согласование.</li>
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}
