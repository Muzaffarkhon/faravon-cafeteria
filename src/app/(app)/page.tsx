import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { getCurrentPeriod, getApplicationWithItems } from "@/lib/selection";
import { Card, SectionTitle } from "@/components/ui";
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
      <div className="space-y-4">
        <Card className="p-6">
          <h1 className="text-lg font-semibold text-ink">
            Вы вошли как {roles.map((r) => ROLE_LABELS[r]).join(", ")}
          </h1>
          {links.length === 0 && (
            <p className="mt-2 text-sm text-ink-muted">
              Разделы для вашей роли (справочники, отчёты) — в разработке.
            </p>
          )}
        </Card>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block rounded-xl border border-line bg-surface p-5 shadow-sm transition-colors hover:border-primary-border hover:bg-primary-soft/40"
          >
            <div className="text-sm font-medium text-primary-strong">{l.label}</div>
            <div className="text-xs text-ink-muted">{l.desc}</div>
          </Link>
        ))}
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

  const application = period
    ? await getApplicationWithItems(emp.id, period.id)
    : null;
  const items = application?.items ?? [];
  const activeItems = items.filter((i) => !["CANCELLED", "REJECTED"].includes(i.status));
  const selectedIds = activeItems.map((i) => i.cardId);
  const draftCount = items.filter((i) => i.status === "DRAFT").length;

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
        <section>
          <div className="grid gap-3">
            {banners.map((b) => (
              <a key={b.id} href={b.href ?? "#"} className="block overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-sm transition-transform hover:scale-[1.01]">
                <div className="flex items-center gap-3">
                  {b.imageUrl && <img src={b.imageUrl} alt="" className="h-16 w-24 rounded-md object-cover" />}
                  <div>
                    <div className="text-sm font-semibold text-ink">{b.title}</div>
                    {b.subtitle && <div className="text-xs text-ink-muted">{b.subtitle}</div>}
                  </div>
                </div>
              </a>
            ))}
          </div>
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
          <p className="mt-3 text-sm leading-7 text-ink">{goal.content}</p>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.75fr]">
        <div className="space-y-6">
          <section className="space-y-3">
            <SectionTitle>Программы признания</SectionTitle>
            <ul className="grid gap-3 md:grid-cols-3">
              {recognition.map((c) => (
                <li
                  key={c.id}
                  className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-border hover:shadow-md"
                >
                  {c.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" loading="lazy" />
                  )}
                  <div className="p-4">
                    <div className="text-sm font-semibold text-ink">{c.title}</div>
                    {c.description && <p className="mt-1 text-xs leading-5 text-ink-muted">{c.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <SectionTitle>Витрина заботы</SectionTitle>
            <ul className="grid gap-2 md:grid-cols-2">
              {care.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink shadow-xs transition-colors hover:border-primary-border hover:bg-primary-soft/40"
                >
                  {c.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.imageUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover"
                      loading="lazy"
                    />
                  )}
                  <span className="min-w-0 truncate">{c.title}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <SectionTitle>Реестр гибких льгот</SectionTitle>
            <p className="text-xs text-ink-muted">
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
              }))}
              selectedIds={selectedIds}
              draftCount={draftCount}
              maxSelections={period?.maxSelections ?? 4}
              windowOpen={!!period?.windowOpen}
              hasSubmittable={draftCount > 0}
            />
          </section>
        </div>

        <aside className="space-y-5">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-ink">Быстрые действия</div>
              <span className="rounded-full bg-surface-muted px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                Dashboard
              </span>
            </div>
            <div className="space-y-2">
              <Link
                href="/applications"
                className="block rounded-2xl border border-line bg-primary-soft px-3 py-2.5 text-sm font-medium text-primary-strong transition-colors hover:border-primary-border"
              >
                Мои заявки и купоны
              </Link>
              <Link
                href="/profile"
                className="block rounded-2xl border border-line bg-surface-muted px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:border-primary-border hover:bg-surface"
              >
                Профиль и безопасность
              </Link>
            </div>
          </Card>

          {notice && (
            <Card className="border-warning-soft bg-warning-soft/70 p-4 shadow-none">
              <div className="text-sm font-semibold text-warning-strong">{notice.title}</div>
              <p className="mt-2 text-xs leading-5 text-warning-strong/80">{notice.content}</p>
            </Card>
          )}

          <Card className="p-4">
            <div className="text-sm font-semibold text-ink">Как работает выбор</div>
            <ol className="mt-3 space-y-2 text-xs leading-5 text-ink-muted">
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
