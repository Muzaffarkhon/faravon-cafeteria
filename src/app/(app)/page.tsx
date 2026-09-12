import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { resolveSelectionContext, getApplicationWithItems, groupProgress } from "@/lib/selection";
import { Card } from "@/components/ui";
import { safeLinkHref, safeImageSrc } from "@/lib/safe-url";
import { FlexSelection } from "./_components/flex-selection";
import { BannerCarousel, type BannerSlide } from "./_banner-carousel";
import { buildNavGroups } from "./_nav";
import { computeNavBadges } from "./_badges";

export default async function OverviewPage() {
  const session = await getSession();
  const [goal, notice] = await Promise.all([
    db.textBlock.findUnique({ where: { key: "GOAL" } }),
    db.textBlock.findUnique({ where: { key: "NOVELTY_NOTICE" } }),
  ]);

  if (!session?.employee) {
    const roles = session?.roles ?? [];
    // Плитки строятся из того же списка разделов, что и меню «Ещё» в шапке
    // (src/app/(app)/_nav.ts) — чтобы раздел нельзя было добавить в одно
    // место и забыть про другое. Счётчики — из того же computeNavBadges,
    // что и меню, иначе плитки снова разошлись бы с тем, что видно наверху.
    const partnerId = session?.user.partnerId ?? null;
    const [partner, badges] = await Promise.all([
      partnerId
        ? db.partner.findUnique({ where: { id: partnerId }, select: { deliveryMode: true } })
        : Promise.resolve(null),
      computeNavBadges({ roles, employeeId: null, partnerId }),
    ]);
    const allGroups = buildNavGroups({
      roles,
      hasEmployee: false,
      partnerId,
      isTaxiContractor:
        can(roles, "promo.broadcast") && !!partnerId && partner?.deliveryMode === "PHONE_PROMO",
      badges,
    });
    const hasAdminAccess = allGroups.some(
      (g) => (g.id === "catalog" || g.id === "admin") && g.items.length > 0,
    );
    // Учётка без карточки сотрудника (C&B, сервисный аккаунт) с доступом в
    // админку — «Кабинет» ей не нужен вовсе, все инструменты (включая
    // «Работу») собраны в левом меню /admin. Остаётся только для тех, у
    // кого есть исключительно «Работа» (подрядчик, согласующий и т.п.).
    if (hasAdminAccess) redirect("/admin");

    const groups = allGroups.filter((g) => g.id === "work");
    const total = groups.reduce((n, g) => n + g.items.length, 0);

    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-ink sm:text-[1.5625rem]">Кабинет</h1>
          <p className="text-sm text-ink-muted">
            Вы вошли как {roles.map((r) => ROLE_LABELS[r]).join(", ")}
          </p>
        </div>

        {total === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-ink-muted">
              Разделы для вашей роли (справочники, отчёты) появятся здесь по мере готовности.
            </p>
          </Card>
        ) : (
          groups.map((g) => (
            <section key={g.id} className="space-y-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                {g.label}
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                {g.items.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="group flex h-full items-start gap-4 rounded-[20px] bg-surface p-5 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.9375rem] font-bold text-ink">{l.label}</span>
                          {!!l.badge && (
                            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold leading-none text-on-brand tabular-nums">
                              {l.badge > 99 ? "99+" : l.badge}
                            </span>
                          )}
                        </div>
                        {l.desc && (
                          <p className="mt-1 text-sm leading-6 text-ink-muted">{l.desc}</p>
                        )}
                      </div>
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-muted transition-[transform,background-color,color] duration-200 group-hover:translate-x-0.5 group-hover:bg-primary-soft group-hover:text-primary-strong"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    );
  }

  const emp = session.employee;
  const ctx = await resolveSelectionContext();
  // Для показа периода/окна — период с открытым окном; для выбора — целевой
  // (после старта периода выбор переносится на следующий, §2).
  const period = ctx.windowPeriod;
  const targetPeriod = ctx.targetPeriod;

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

  const application = targetPeriod
    ? await getApplicationWithItems(emp.id, targetPeriod.id)
    : null;
  const items = application?.items ?? [];
  const activeItems = items.filter((i) => !["CANCELLED", "REJECTED"].includes(i.status));
  const selectedIds = activeItems.map((i) => i.cardId);
  const draftCount = items.filter((i) => i.status === "DRAFT").length;
  const maxSelections = targetPeriod?.maxSelections ?? period?.maxSelections ?? 4;

  // Статус позиции по карточке — чтобы показать «уже выбрано / отклонено / в обработке».
  const itemStatusByCard = new Map(items.map((i) => [i.cardId, i.status] as const));
  // Прогресс набора групп для карточек с порогом (§ minParticipants).
  const groupCards = flex.filter((c) => c.minParticipants > 1);
  const groupCount = targetPeriod
    ? await groupProgress(groupCards.map((c) => c.id), targetPeriod.id)
    : new Map<string, number>();

  const windowOpen = ctx.windowOpen && !ctx.missingNextPeriod;

  // Слайды баннера (§6): реклама партнёров + свои новости (kind NEWS, без пометки
  // «Партнёр») + групповые льготы, не набравшие порог, — с переходом на выбор.
  const partnerBannerSlides: BannerSlide[] = banners.map((b) => {
    const isNews = b.kind === "NEWS";
    const cardId = !isNews && b.partnerId ? flexCardByPartner.get(b.partnerId) : undefined;
    const cardHref = cardId ? `#card-${cardId}` : undefined;
    const safeHref = safeLinkHref(b.href);
    const androidUrl = safeLinkHref(b.androidUrl);
    const iosUrl = safeLinkHref(b.iosUrl);
    const appHref = androidUrl ?? iosUrl;
    // Приоритет клика: ссылка на приложение → якорь на льготу → произвольная ссылка.
    const linkHref = appHref ?? cardHref ?? safeHref;
    return {
      id: b.id,
      kind: isNews ? ("news" as const) : ("partner" as const),
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: safeImageSrc(b.imageUrl),
      linkHref,
      androidUrl,
      iosUrl,
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

  // Групповые льготы — первыми; дальше баннеры. Стартовый слайд карусель
  // выбирает случайно при каждом заходе (§6) — см. BannerCarousel.
  const bannerSlides = [...groupBannerSlides, ...partnerBannerSlides];

  const firstName = emp.fullName.split(" ")[1] || emp.fullName;
  const periodLine = period
    ? period.windowOpen
      ? `Окно выбора открыто до ${period.windowEnd.toLocaleDateString("ru-RU")}`
      : "Окно выбора сейчас закрыто"
    : "Активный период ещё не открыт";

  return (
    <div className="space-y-8">
      {/* ── Герой ── счётчики и кнопка «Заявки и купоны» вынесены в закреплённую шапку. */}
      <section className="rounded-[20px] bg-primary p-5 text-on-brand sm:rounded-[28px] sm:p-6">
        <h1 className="font-display text-xl font-bold text-on-brand sm:text-2xl">
          Здравствуйте, {firstName}
        </h1>
        <p className="mt-1 text-sm text-on-brand/80">{periodLine}</p>
        {ctx.rolledOver && targetPeriod && (
          <p className="mt-1 text-sm font-semibold text-on-brand">
            Текущий период уже идёт — ваш выбор пойдёт в «{targetPeriod.name}».
          </p>
        )}
        {ctx.missingNextPeriod && (
          <p className="mt-1 text-sm font-semibold text-on-brand">
            Период уже начался. Выбор откроется, когда C&amp;B создаст следующий период.
          </p>
        )}
      </section>

      {bannerSlides.length > 0 && <BannerCarousel slides={bannerSlides} />}

      {goal && (
        <section className="rounded-[20px] bg-primary-soft px-6 py-7 sm:px-8">
          <div className="text-xs font-bold uppercase tracking-[0.1em] text-primary-strong">
            Цель программы
          </div>
          <p className="mt-3 max-w-3xl whitespace-pre-line text-[1.0625rem] leading-8 text-ink sm:text-[1.125rem] sm:leading-9">
            {goal.content}
          </p>
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
                    <p className="mt-1.5 text-sm leading-6 text-ink-muted line-clamp-3">
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
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">
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
        <p className="text-sm leading-6 text-ink-muted">
          Выберите до {maxSelections} льгот. После подтверждения выбор поступит на согласование.
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
            phonePromo: c.partner?.deliveryMode === "PHONE_PROMO",
            lockedStatus:
              itemStatusByCard.get(c.id) && itemStatusByCard.get(c.id) !== "DRAFT"
                ? (itemStatusByCard.get(c.id) as string)
                : null,
          }))}
          selectedIds={selectedIds}
          draftCount={draftCount}
          maxSelections={maxSelections}
          windowOpen={windowOpen}
          hasSubmittable={draftCount > 0}
          defaultPhone={emp.phone ?? ""}
        />
      </section>
    </div>
  );
}
