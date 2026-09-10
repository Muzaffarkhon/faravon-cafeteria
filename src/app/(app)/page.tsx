import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { getCurrentPeriod, getApplicationWithItems, groupProgress } from "@/lib/selection";
import { Card } from "@/components/ui";
import { safeLinkHref, safeImageSrc } from "@/lib/safe-url";
import { FlexSelection } from "./_components/flex-selection";
import { BannerCarousel, type BannerSlide } from "./_banner-carousel";

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
    if (can(roles, "feedback.manage"))
      links.push({ href: "/admin/feedback", label: "Обратная связь", desc: "обращения сотрудников по программе льгот" });

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
    db.benefitCard.findMany({ where: { block: "RECOGNITION", status: "PUBLISHED", archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    db.benefitCard.findMany({ where: { block: "CARE", status: "PUBLISHED", archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    db.benefitCard.findMany({
      where: { block: "FLEX", status: "PUBLISHED", archivedAt: null },
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

  const partnerBannerSlides: BannerSlide[] = banners.map((b) => {
    const isNews = b.kind === "NEWS";
    const cardId = !isNews && b.partnerId ? flexCardByPartner.get(b.partnerId) : undefined;
    const cardHref = cardId ? `#card-${cardId}` : undefined;
    const safeHref = safeLinkHref(b.href);
    const androidUrl = safeLinkHref(b.androidUrl);
    const iosUrl = safeLinkHref(b.iosUrl);
    const appHref = androidUrl ?? iosUrl;
    const linkHref = appHref ?? cardHref ?? safeHref;
    return {
      id: b.id,
      kind: isNews ? ("news" as const) : ("partner" as const),
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: safeImageSrc(b.imageUrl),
      linkHref,
      external: !!appHref || (!cardHref && !!safeHref && /^https?:\/\//i.test(safeHref)),
      cta: appHref ? "Установить приложение" : cardHref ? "Перейти к льготе" : "Подробнее",
    };
  });

  const groupBannerSlides: BannerSlide[] = groupCards
    .filter((c) => c.isActive && (groupCount.get(c.id) ?? 0) < c.minParticipants)
    .map((c) => {
      const have = groupCount.get(c.id) ?? 0;
      const remaining = c.minParticipants - have;
      return {
        id: `group-${c.id}`,
        kind: "group",
        title: c.title,
        subtitle: `Групповая льгота: выбрали ${have} из ${c.minParticipants}. Нужно ещё ${remaining}${period?.windowOpen ? " — выберите в один клик." : "."}`,
        imageUrl: safeImageSrc(c.imageUrl),
        linkHref: `#card-${c.id}`,
        external: false,
        cta: period?.windowOpen ? "Перейти к выбору" : "Перейти к льготе",
        progress: { current: have, min: c.minParticipants },
      };
    });

  const bannerSlides = [...groupBannerSlides, ...partnerBannerSlides];

  const firstName = emp.fullName.split(" ")[1] || emp.fullName;
  const periodLine = period
    ? period.windowOpen
      ? `Окно выбора открыто до ${period.windowEnd.toLocaleDateString("ru-RU")}`
      : "Окно выбора сейчас закрыто"
    : "Активный период ещё не открыт";

  return (
    <div className="space-y-8">
      {/* ── Герой ── */}
      <section className="rounded-[20px] bg-primary p-6 text-on-brand sm:rounded-[28px] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-on-brand sm:text-[1.75rem]">
              Здравствуйте, {firstName}
            </h1>
            <p className="mt-1 text-sm text-on-brand/80">{periodLine}</p>
          </div>
          <div className="flex w-full gap-3 sm:w-auto">
            <div className="flex-1 rounded-2xl bg-primary-strong px-5 py-3.5 text-center sm:min-w-[7rem]">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-on-brand/70">
                Выбрано
              </div>
              <div className="text-[22px] font-bold text-on-brand" data-numeric>
                {activeItems.length}/{period?.maxSelections ?? 4}
              </div>
            </div>
            <div className="flex-1 rounded-2xl bg-primary-strong px-5 py-3.5 text-center sm:min-w-[7rem]">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-on-brand/70">
                Черновики
              </div>
              <div className="text-[22px] font-bold text-on-brand" data-numeric>
                {draftCount}
              </div>
            </div>
          </div>
        </div>
        <Link
          href="/applications"
          className="mt-5 inline-flex items-center gap-1.5 rounded-[10px] bg-on-brand px-4 py-2.5 text-[13px] font-bold text-primary-strong transition-colors hover:bg-on-brand/90"
        >
          Мои заявки и купоны
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </section>

      {bannerSlides.length > 0 && <BannerCarousel slides={bannerSlides} />}

      {goal && (
        <section className="rounded-[20px] bg-primary-soft px-6 py-6 sm:px-7">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary-strong">
            Цель программы
          </div>
          <p className="mt-2 max-w-3xl text-[0.9375rem] leading-7 text-ink">{goal.content}</p>
        </section>
      )}

      {notice && (
        <section className="rounded-[20px] border border-warning-soft bg-warning-soft/70 px-6 py-5">
          <div className="text-sm font-bold text-warning-strong">{notice.title}</div>
          <p className="mt-1.5 text-sm leading-6 text-warning-strong/80">{notice.content}</p>
        </section>
      )}

      {recognition.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-[19px] font-bold text-ink">Программы признания</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recognition.map((c) => (
              <li
                key={c.id}
                className="group flex flex-col overflow-hidden rounded-[20px] bg-surface shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-md"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-sunken">
                  {safeImageSrc(c.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeImageSrc(c.imageUrl)!}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(135deg,var(--sand-200)_0_10px,var(--sand-100)_10px_20px)]" />
                  )}
                </div>
                <div className="flex flex-1 flex-col p-[18px]">
                  <h3 className="text-[15px] font-bold leading-snug text-ink">{c.title}</h3>
                  {c.description && (
                    <p className="mt-1.5 text-[13px] leading-6 text-ink-muted line-clamp-3">
                      {c.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {care.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-[19px] font-bold text-ink">Витрина заботы</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {care.map((c) => (
              <li
                key={c.id}
                className="group flex flex-col overflow-hidden rounded-[20px] bg-surface shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-md"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-primary-soft">
                  {safeImageSrc(c.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeImageSrc(c.imageUrl)!}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="h-full w-full bg-[repeating-linear-gradient(135deg,var(--brand-100)_0_10px,var(--brand-50)_10px_20px)]" />
                  )}
                </div>
                <div className="p-[18px]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                    Гарантировано всем
                  </p>
                  <p className="mt-1 text-[17px] font-bold leading-snug text-ink">{c.title}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-display text-[19px] font-bold text-ink">Гибкие льготы</h2>
        <p className="text-[13px] leading-6 text-ink-muted">
          Выберите до {period?.maxSelections ?? 4} льгот. После подтверждения выбор поступит на
          согласование.
        </p>
        <FlexSelection
          cards={flex.map((c) => ({
            id: c.id,
            title: c.title,
            condition: c.condition,
            isActive: c.isActive,
            partner: c.partner?.name ?? null,
            imageUrl: c.imageUrl,
            category: c.category,
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
  );
}
