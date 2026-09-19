import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import {
  resolveSelectionContext,
  getApplicationWithItems,
  groupProgress,
  getPreviousPeriodPicks,
  getAutoPickedCardIds,
  ensureAutoPicks,
} from "@/lib/selection";
import { Card } from "@/components/ui";
import { safeLinkHref, safeImageSrc } from "@/lib/safe-url";
import { FlexSelection } from "./_components/flex-selection";
import { BannerCarousel, type BannerSlide } from "./_banner-carousel";
import { buildNavGroups } from "./_nav";
import { computeNavBadges } from "./_badges";
import { getLocale, getTranslator } from "@/lib/i18n";
import { localize } from "@/lib/localize";
import { isEligibleForSatisfactionSurvey } from "@/lib/satisfaction";
import { SatisfactionPrompt } from "./_satisfaction-prompt";

export default async function OverviewPage() {
  const session = await getSession();
  const t = await getTranslator();
  const locale = await getLocale();
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

    // Подрядчик-кассир/подрядчик такси: единственный (или единственный +
    // «Реклама») пункт — касса партнёра либо выдача промокодов. «Кабинет» с
    // плиткой в один клик до той же страницы был лишним шагом — открываем
    // сразу (вкладки шапки, включая «Реклама», остаются доступны как обычно).
    const workItems = groups.find((g) => g.id === "work")?.items ?? [];
    const soleWorkHref = (href: string) =>
      groups.length === 1 &&
      workItems.some((it) => it.href === href) &&
      workItems.every((it) => it.href === href || it.href === "/advertising");
    if (soleWorkHref("/provider")) redirect("/provider");
    if (soleWorkHref("/provider/taxi")) redirect("/provider/taxi");

    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-ink sm:text-[1.5625rem]">{t("home.cabinet")}</h1>
          <p className="text-sm text-ink-muted">
            {t("home.loggedInAs")} {roles.map((r) => ROLE_LABELS[r]).join(", ")}
          </p>
        </div>

        {total === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-ink-muted">
              {t("home.rolesEmptyHint")}
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
                              {l.badge}
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
  const satisfactionEligible = await isEligibleForSatisfactionSurvey(emp.id);
  // Сотрудник ни разу не подавал заявку — значит, ему ещё не встречались ни
  // статусы, ни купон/промокод. Показываем короткое объяснение механики один
  // раз: как только появится первая позиция (любого статуса), блок исчезает
  // сам — не нужен ни клиентский стейт, ни отдельная настройка «прочитано».
  const everSubmitted = await db.applicationItem.count({
    where: { application: { employeeId: emp.id } },
  });
  const isNewEmployee = everSubmitted === 0;
  const ctx = await resolveSelectionContext();
  // Для показа периода/окна — период с открытым окном; для выбора — целевой
  // (после старта периода выбор переносится на следующий, §2).
  const period = ctx.windowPeriod;
  const targetPeriod = ctx.targetPeriod;

  const [recognitionRaw, careRaw, flexRaw] = await Promise.all([
    db.benefitCard.findMany({ where: { block: "RECOGNITION", status: "PUBLISHED", archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    db.benefitCard.findMany({ where: { block: "CARE", status: "PUBLISHED", archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    db.benefitCard.findMany({
      where: { block: "FLEX", status: "PUBLISHED", archivedAt: null },
      orderBy: { sortOrder: "asc" },
      include: { partner: true },
    }),
  ]);

  // Переводы (§i18n) — карточка и её партнёр локализуются один раз здесь, весь
  // остальной код страницы (баннеры, группы, вывод) дальше работает как обычно.
  const localizeCard = <T extends { title: string; description: string | null; condition: string | null; translations: unknown }>(
    c: T,
  ): T => ({
    ...c,
    title: localize(c.title, c.translations, locale, "title"),
    description: localize(c.description, c.translations, locale, "description"),
    condition: localize(c.condition, c.translations, locale, "condition"),
  });
  const recognition = recognitionRaw.map(localizeCard);
  const care = careRaw.map(localizeCard);
  const flex = flexRaw.map((c) => ({
    ...localizeCard(c),
    partner: c.partner
      ? {
          ...c.partner,
          name: localize(c.partner.name, c.partner.translations, locale, "name"),
          discountType: localize(c.partner.discountType, c.partner.translations, locale, "discountType"),
          terms: localize(c.partner.terms, c.partner.translations, locale, "terms"),
          contactPerson: localize(c.partner.contactPerson, c.partner.translations, locale, "contactPerson"),
        }
      : c.partner,
  }));

  const banners = await db.partnerBanner.findMany({ where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }] }, orderBy: { sortOrder: "asc" } });

  // Баннер партнёра → якорь на его гибкую льготу в списке ниже (активная в приоритете).
  const flexCardByPartner = new Map<string, string>();
  for (const c of flex) if (c.partnerId && c.isActive && !flexCardByPartner.has(c.partnerId)) flexCardByPartner.set(c.partnerId, c.id);
  for (const c of flex) if (c.partnerId && !flexCardByPartner.has(c.partnerId)) flexCardByPartner.set(c.partnerId, c.id);

  const windowOpen = ctx.windowOpen && !ctx.missingNextPeriod;

  let application = targetPeriod ? await getApplicationWithItems(emp.id, targetPeriod.id) : null;
  // Автовыбор (§5): заявки на период ещё нет — первое обращение сотрудника
  // после открытия окна. Применяем сохранённые льготы один раз здесь, а не
  // при каждом заходе (иначе вернули бы то, что сотрудник сам убрал).
  if (!application && windowOpen && targetPeriod) {
    await ensureAutoPicks(emp.id, targetPeriod);
    application = await getApplicationWithItems(emp.id, targetPeriod.id);
  }
  const items = application?.items ?? [];
  const activeItems = items.filter((i) => !["CANCELLED", "REJECTED"].includes(i.status));
  const selectedIds = activeItems.map((i) => i.cardId);
  const draftCount = items.filter((i) => i.status === "DRAFT").length;
  const maxSelections = targetPeriod?.maxSelections ?? period?.maxSelections ?? 4;

  // Статус позиции по карточке — чтобы показать «уже выбрано / отклонено / в обработке».
  const itemStatusByCard = new Map(items.map((i) => [i.cardId, i.status] as const));
  // Очередь наборов для групповых льгот: как только счётчик доходит до порога —
  // это готовая группа (купоны выдаются сразу, см. issueCouponIfReady), а счётчик
  // для интерфейса начинается заново для следующей группы. Без этого прогресс-бар
  // навсегда «застревал» зелёным и полным после первого набора порога, и сотрудники
  // думали, что мест больше нет, хотя выбор в новую группу по-прежнему шёл сразу.
  // Только для карточек с groupWaves (набор группами). У «минимум N» (groupWaves=false)
  // очереди нет: набрали порог — прогресс скрывается (см. groupHidden ниже).
  const groupWaveOf = (
    have: number,
    min: number,
    waves: boolean,
  ): { inWave: number; wave: number; done: boolean } => {
    if (!waves) return { inWave: Math.min(have, min), wave: 1, done: have >= min };
    if (have <= 0) return { inWave: 0, wave: 1, done: false };
    const wave = Math.floor((have - 1) / min) + 1;
    const inWave = have - (wave - 1) * min;
    return { inWave, wave, done: inWave === min };
  };
  // Прогресс набора групп для карточек с порогом (§ minParticipants).
  const groupCards = flex.filter((c) => c.minParticipants > 1);
  // «Минимум N»: порог набран — бар и баннер прогресса больше не нужны.
  const groupHiddenOf = (c: { id: string; minParticipants: number; groupWaves: boolean }) =>
    !c.groupWaves && (groupCount.get(c.id) ?? 0) >= c.minParticipants;
  const groupCount = targetPeriod
    ? await groupProgress(groupCards.map((c) => c.id), targetPeriod.id)
    : new Map<string, number>();

  // «Выбрать как в прошлый раз» (§4): льготы из последнего прошлого периода,
  // которые сотрудник ещё не выбрал/не пытался выбрать в текущем — с учётом
  // только тех, что всё ещё опубликованы и активны (пересечение с `flex`).
  const flexTitleById = new Map(flex.map((c) => [c.id, c.title]));
  const previousPicks =
    windowOpen && targetPeriod
      ? (await getPreviousPeriodPicks(emp.id, targetPeriod.startDate))
          .filter((p) => flexTitleById.has(p.cardId) && !selectedIds.includes(p.cardId))
          .map((p) => ({ cardId: p.cardId, title: flexTitleById.get(p.cardId)! }))
      : [];

  // Лайки на карточки витрины (§10): не привязаны к периоду, просто счётчик
  // популярности + собственный лайк сотрудника.
  const flexIds = flex.map((c) => c.id);
  const [likeCounts, myLikes, autoPickedIds] = await Promise.all([
    db.cardLike.groupBy({ by: ["cardId"], where: { cardId: { in: flexIds } }, _count: { cardId: true } }),
    db.cardLike.findMany({ where: { cardId: { in: flexIds }, employeeId: emp.id }, select: { cardId: true } }),
    getAutoPickedCardIds(emp.id),
  ]);
  const likeCountByCard = new Map(likeCounts.map((l) => [l.cardId, l._count.cardId]));
  const likedCardIds = new Set(myLikes.map((l) => l.cardId));

  // Слайды баннера (§6): реклама партнёров + свои новости (kind NEWS, без пометки
  // «Партнёр») + групповые льготы, набирающие текущую очередь, — с переходом на выбор.
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
      cta: appHref ? t("home.installApp") : cardHref ? t("home.goToBenefit") : t("home.moreDetails"),
    };
  });

  const groupBannerSlides: BannerSlide[] = groupCards
    .filter((c) => c.isActive && !groupHiddenOf(c))
    .map((c) => {
      const have = groupCount.get(c.id) ?? 0;
      const { inWave, wave } = groupWaveOf(have, c.minParticipants, c.groupWaves);
      const remaining = c.minParticipants - inWave;
      const waveHint = wave > 1 ? ` ${t("home.groupBenefitWavePrefix")} ${wave}.` : "";
      return {
        id: `group-${c.id}`,
        kind: "group",
        title: c.title,
        subtitle: `${t("home.groupBenefitPrefix")} ${inWave} ${t("home.groupBenefitOf")} ${c.minParticipants}.${waveHint} ${t("home.groupBenefitNeedMore")} ${remaining}${period?.windowOpen ? ` ${t("home.groupBenefitClickHint")}` : "."}`,
        imageUrl: safeImageSrc(c.imageUrl),
        linkHref: `#card-${c.id}`,
        external: false,
        cta: period?.windowOpen ? t("home.goToSelection") : t("home.goToBenefit"),
        progress: { current: inWave, min: c.minParticipants },
      };
    });

  // Групповые льготы — первыми; дальше баннеры. Стартовый слайд карусель
  // выбирает случайно при каждом заходе (§6) — см. BannerCarousel.
  const bannerSlides = [...groupBannerSlides, ...partnerBannerSlides];

  const firstName = emp.fullName.split(" ")[1] || emp.fullName;
  const periodLine = period
    ? period.windowOpen
      ? `${t("home.windowOpenUntil")} ${period.windowEnd.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" })}`
      : t("home.windowClosed")
    : t("home.periodNotOpen");

  return (
    <div className="space-y-8">
      <SatisfactionPrompt eligible={satisfactionEligible} locale={locale} />
      {/* ── Герой ── счётчики и кнопка «Заявки и купоны» вынесены в закреплённую шапку. */}
      <section className="rounded-[20px] bg-primary p-5 text-on-brand sm:rounded-[28px] sm:p-6">
        <h1 className="font-display text-xl font-bold text-on-brand sm:text-2xl">
          {t("home.greeting")}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-on-brand/80">{periodLine}</p>
        {ctx.rolledOver && targetPeriod && (
          <p className="mt-1 text-sm font-semibold text-on-brand">
            {t("home.rolledOverPrefix")}{targetPeriod.name}{t("home.rolledOverSuffix")}
          </p>
        )}
        {ctx.missingNextPeriod && (
          <p className="mt-1 text-sm font-semibold text-on-brand">
            {t("home.missingNextPeriod")}
          </p>
        )}
      </section>

      {isNewEmployee && (
        <section className="rounded-[20px] border border-line bg-surface px-6 py-6 sm:px-8">
          <div className="text-xs font-bold uppercase tracking-[0.1em] text-ink-subtle">
            {t("home.onboardingTitle")}
          </div>
          <ol className="mt-3 space-y-2.5 text-sm leading-6 text-ink-muted">
            <li className="flex gap-2.5">
              <span className="shrink-0 font-bold text-ink">1.</span>
              {t("home.onboardingStep1")}
            </li>
            <li className="flex gap-2.5">
              <span className="shrink-0 font-bold text-ink">2.</span>
              {t("home.onboardingStep2")}
            </li>
            <li className="flex gap-2.5">
              <span className="shrink-0 font-bold text-ink">3.</span>
              {t("home.onboardingStep3")}
            </li>
            <li className="flex gap-2.5">
              <span className="shrink-0 font-bold text-ink">4.</span>
              {t("home.onboardingStep4")}
            </li>
          </ol>
        </section>
      )}

      {bannerSlides.length > 0 && <BannerCarousel slides={bannerSlides} locale={locale} />}

      {goal && (
        <section className="rounded-[20px] bg-primary-soft px-6 py-7 sm:px-8">
          <div className="text-xs font-bold uppercase tracking-[0.1em] text-primary-strong">
            {t("home.goalLabel")}
          </div>
          <p className="mt-3 max-w-3xl whitespace-pre-line text-[1.0625rem] leading-8 text-ink sm:text-[1.125rem] sm:leading-9">
            {localize(goal.content, goal.translations, locale, "content")}
          </p>
        </section>
      )}

      {notice && (
        <section className="rounded-[20px] border border-warning-soft bg-warning-soft/70 px-6 py-5">
          <div className="text-sm font-bold text-warning-strong">
            {localize(notice.title, notice.translations, locale, "title")}
          </div>
          <p className="mt-1.5 text-sm leading-6 text-warning-strong/80">
            {localize(notice.content, notice.translations, locale, "content")}
          </p>
        </section>
      )}

      {recognition.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-[19px] font-bold text-ink">{t("home.recognitionPrograms")}</h2>
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
          <h2 className="font-display text-[19px] font-bold text-ink">{t("home.careShowcase")}</h2>
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
                    {t("home.guaranteedForAll")}
                  </p>
                  <p className="mt-1 text-[17px] font-bold leading-snug text-ink">{c.title}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-display text-[19px] font-bold text-ink">{t("home.flexBenefits")}</h2>
        <p className="text-sm leading-6 text-ink-muted">
          {t("home.selectUpTo")} {maxSelections} {t("home.benefitsAfterConfirm")}
        </p>
        <FlexSelection
          cards={flex.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            condition: c.condition,
            isActive: c.isActive,
            partner: c.partner?.name ?? null,
            address: c.partner?.address ?? null,
            workingHours: c.partner?.workingHours ?? null,
            discountType: c.partner?.discountType ?? null,
            terms: c.partner?.terms ?? null,
            contactPerson: c.partner?.contactPerson ?? null,
            contacts: c.partner?.contacts ?? null,
            imageUrl: c.imageUrl,
            category: c.category,
            minParticipants: c.minParticipants,
            groupCount: groupWaveOf(groupCount.get(c.id) ?? 0, c.minParticipants, c.groupWaves).inWave,
            groupWave: groupWaveOf(groupCount.get(c.id) ?? 0, c.minParticipants, c.groupWaves).wave,
            groupHidden: groupHiddenOf(c),
            phonePromo: c.partner?.deliveryMode === "PHONE_PROMO",
            likeCount: likeCountByCard.get(c.id) ?? 0,
            liked: likedCardIds.has(c.id),
            autoPicked: autoPickedIds.has(c.id),
            lockedStatus:
              itemStatusByCard.get(c.id) && itemStatusByCard.get(c.id) !== "DRAFT"
                ? (itemStatusByCard.get(c.id) as string)
                : null,
          }))}
          selectedIds={selectedIds}
          previousPicks={previousPicks}
          atSelectionLimit={selectedIds.length >= maxSelections}
          draftCount={draftCount}
          maxSelections={maxSelections}
          windowOpen={windowOpen}
          hasSubmittable={draftCount > 0}
          defaultPhone={emp.phone ?? ""}
          locale={locale}
        />
      </section>
    </div>
  );
}
