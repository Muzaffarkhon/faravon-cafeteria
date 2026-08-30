import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { getCurrentPeriod, getApplicationWithItems } from "@/lib/selection";
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
      links.push({ href: "/admin/reports", label: "Отчёты и метрики", desc: "активация, вовлечение, конверсия, топ льгот, экспорт CSV" });

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h1 className="text-lg font-semibold">
            Вы вошли как {roles.map((r) => ROLE_LABELS[r]).join(", ")}
          </h1>
          {links.length === 0 && (
            <p className="mt-2 text-sm text-neutral-500">
              Разделы для вашей роли (справочники, отчёты) — в разработке.
            </p>
          )}
        </div>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block rounded-xl border border-neutral-200 bg-white p-5 hover:border-red-300"
          >
            <div className="text-sm font-medium text-red-700">{l.label}</div>
            <div className="text-xs text-neutral-500">{l.desc}</div>
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
    <div className="space-y-8">
      {/* Employee header */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{emp.fullName}</h1>
            <p className="text-sm text-neutral-500">
              {emp.position} · {emp.department}
            </p>
          </div>
          {period ? (
            <div className="rounded-lg bg-neutral-100 px-3 py-2 text-right text-xs text-neutral-600">
              <div className="font-medium text-neutral-800">Период: {period.name}</div>
              <div>
                {period.windowOpen
                  ? `Окно выбора открыто до ${period.windowEnd.toLocaleDateString("ru-RU")}`
                  : "Окно выбора закрыто"}
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
              Активный период не открыт
            </div>
          )}
        </div>
      </section>

      {/* Goal */}
      {goal && (
        <section>
          <h2 className="mb-2 text-base font-semibold text-red-700">{goal.title}</h2>
          <p className="text-sm leading-relaxed text-neutral-700">{goal.content}</p>
        </section>
      )}

      {/* Recognition */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-red-700">Программы признания</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {recognition.map((c) => (
            <li key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="text-sm font-medium">{c.title}</div>
              {c.description && <p className="mt-1 text-xs text-neutral-600">{c.description}</p>}
            </li>
          ))}
        </ul>
      </section>

      {/* Care */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-red-700">Витрина заботы</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {care.map((c) => (
            <li key={c.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm">
              {c.title}
            </li>
          ))}
        </ul>
      </section>

      {/* Flex registry */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-red-700">Реестр гибких льгот</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Выберите до {period?.maxSelections ?? 4} льгот. После подтверждения выбор поступит на согласование.
        </p>
        <FlexSelection
          cards={flex.map((c) => ({
            id: c.id,
            title: c.title,
            condition: c.condition,
            isActive: c.isActive,
            partner: c.partner?.name ?? null,
          }))}
          selectedIds={selectedIds}
          draftCount={draftCount}
          maxSelections={period?.maxSelections ?? 4}
          windowOpen={!!period?.windowOpen}
          hasSubmittable={draftCount > 0}
        />
      </section>

      {/* Novelty notice */}
      {notice && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-medium text-amber-800">{notice.title}</div>
          <p className="mt-1 text-xs text-amber-700">{notice.content}</p>
        </section>
      )}

      <div className="pt-2">
        <Link href="/applications" className="text-sm font-medium text-red-600 hover:underline">
          Перейти к моим заявкам и купонам →
        </Link>
      </div>
    </div>
  );
}
