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

  const application = period
    ? await getApplicationWithItems(emp.id, period.id)
    : null;
  const items = application?.items ?? [];
  const activeItems = items.filter((i) => !["CANCELLED", "REJECTED"].includes(i.status));
  const selectedIds = activeItems.map((i) => i.cardId);
  const draftCount = items.filter((i) => i.status === "DRAFT").length;

  return (
    <div className="space-y-10">
      {/* Шапка сотрудника */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">{emp.fullName}</h1>
            <p className="text-sm text-ink-muted">
              {emp.position} · {emp.department}
            </p>
          </div>
          {period ? (
            <div className="rounded-lg bg-surface-muted px-3 py-2 text-right text-xs text-ink-muted">
              <div className="font-medium text-ink">Период: {period.name}</div>
              <div>
                {period.windowOpen
                  ? `Окно выбора открыто до ${period.windowEnd.toLocaleDateString("ru-RU")}`
                  : "Окно выбора закрыто"}
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-subtle">
              Активный период не открыт
            </div>
          )}
        </div>
      </Card>

      {/* Цель */}
      {goal && (
        <section className="space-y-2">
          <SectionTitle>{goal.title}</SectionTitle>
          <p className="text-sm leading-relaxed text-ink">{goal.content}</p>
        </section>
      )}

      {/* Программы признания */}
      <section className="space-y-3">
        <SectionTitle>Программы признания</SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-3">
          {recognition.map((c) => (
            <li key={c.id} className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
              {c.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" className="h-28 w-full object-cover" loading="lazy" />
              )}
              <div className="p-4">
                <div className="text-sm font-medium text-ink">{c.title}</div>
                {c.description && <p className="mt-1 text-xs text-ink-muted">{c.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Витрина заботы */}
      <section className="space-y-3">
        <SectionTitle>Витрина заботы</SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2">
          {care.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink shadow-xs"
            >
              {c.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.imageUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-md border border-line object-cover"
                  loading="lazy"
                />
              )}
              {c.title}
            </li>
          ))}
        </ul>
      </section>

      {/* Реестр гибких льгот */}
      <section className="space-y-1">
        <SectionTitle>Реестр гибких льгот</SectionTitle>
        <p className="pb-3 text-xs text-ink-muted">
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

      {/* Уведомление о новизне */}
      {notice && (
        <Card className="border-warning-soft bg-warning-soft/60 p-4 shadow-none">
          <div className="text-sm font-medium text-warning-strong">{notice.title}</div>
          <p className="mt-1 text-xs text-warning-strong/80">{notice.content}</p>
        </Card>
      )}

      <div>
        <Link href="/applications" className="text-sm font-medium text-primary hover:text-primary-hover hover:underline">
          Перейти к моим заявкам и купонам →
        </Link>
      </div>
    </div>
  );
}
