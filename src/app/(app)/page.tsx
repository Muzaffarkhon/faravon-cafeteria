import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { getCurrentPeriod, getApplicationWithItems, groupProgress } from "@/lib/selection";
import { Card, SectionTitle, buttonClass, cx } from "@/components/ui";
import { FlexSelection } from "./_components/flex-selection";
import { BannerCarousel } from "./_banner-carousel";

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
      links.push({ href: "/provider", label: "Активация купонов", desc: "проверка и активация купонов сотрудников у партнёра" });
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

  const bannerSlides = banners.map((b) => {
    const cardId = b.partnerId ? flexCardByPartner.get(b.partnerId) : undefined;
    const cardHref = cardId ? `#card-${cardId}` : undefined;
    const linkHref = cardHref ?? b.href ?? null;
    return {
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      linkHref,
      external: !cardHref && !!b.href && /^https?:\/\//.test(b.href),
      cta: cardHref ? "Перейти к льготе" : "Подробнее",
    };
  });

  const stats = [
    { label: "Выбрано", value: `${activeItems.length}/${period?.maxSelections ?? 4}`, helper: "льгот в периоде" },
    { label: "Черновики", value: String(draftCount), helper: draftCount > 0 ? "ждут подтверждения" : "пусто" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Витрина заботы
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
            Здравствуйте, {emp.fullName.split(" ")[1] || emp.fullName}
          </h1>
        </div>
        <div className="flex gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-surface px-3 py-1.5 text-center">
              <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-subtle">{s.label}</div>
              <div className="text-lg font-semibold leading-none text-ink" data-numeric>{s.value}</div>
            </div>
          ))}
        </div>
      </header>

      {bannerSlides.length > 0 && <BannerCarousel slides={bannerSlides} />}

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
          <Card className={cx("p-5", period?.windowOpen ? "border-primary-border bg-primary-soft/30" : "")}>
            <div className="flex items-center gap-3">
              <div
                className={cx(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold",
                  period?.windowOpen ? "bg-primary text-on-brand" : "bg-surface-muted text-ink-muted",
                )}
              >
                {period?.windowOpen ? "✓" : "—"}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                  {period ? "Текущий период" : "Состояние"}
                </div>
                <div className="truncate text-sm font-semibold text-ink">
                  {period ? period.name : "Активный период не открыт"}
                </div>
                {period && (
                  <div className="text-xs text-ink-muted" data-numeric>
                    {period.windowOpen
                      ? `Окно открыто до ${period.windowEnd.toLocaleDateString("ru-RU")}`
                      : "Окно выбора закрыто"}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-line bg-surface p-3 text-center">
                <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-subtle">Выбрано</div>
                <div className="text-xl font-semibold text-ink" data-numeric>
                  {activeItems.length}/{period?.maxSelections ?? 4}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-surface p-3 text-center">
                <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-subtle">Черновики</div>
                <div className="text-xl font-semibold text-ink" data-numeric>{draftCount}</div>
              </div>
            </div>
            <Link
              href="/applications"
              className={buttonClass({ variant: "primary", fullWidth: true, className: "mt-4" })}
            >
              Мои заявки и купоны
            </Link>
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
