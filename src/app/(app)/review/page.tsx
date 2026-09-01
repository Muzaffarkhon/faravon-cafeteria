import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { ReviewTable, type ReviewRow } from "./_table";

const PAGE_SIZE = 25;
const DAY = 24 * 60 * 60 * 1000;
const SLA_DAYS = 5; // §5.12

type SP = {
  q?: string;
  dept?: string;
  period?: string;
  card?: string;
  sort?: string;
  overdue?: string;
  page?: string;
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "applications.decide")) redirect("/");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const dept = sp.dept ?? "";
  const period = sp.period ?? "";
  const card = sp.card ?? "";
  const sort = sp.sort === "newest" || sp.sort === "employee" ? sp.sort : "oldest";
  const overdue = sp.overdue === "1";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const appFilter: Prisma.ApplicationWhereInput = {};
  if (period) appFilter.periodId = period;
  if (dept || q) {
    appFilter.employee = {
      is: {
        ...(dept ? { department: dept } : {}),
        ...(q ? { fullName: { contains: q, mode: "insensitive" } } : {}),
      },
    };
  }

  const where: Prisma.ApplicationItemWhereInput = { status: "PENDING" };
  if (Object.keys(appFilter).length) where.application = { is: appFilter };
  if (card) where.cardId = card;
  const nowMs = new Date().getTime();
  if (overdue) where.submittedAt = { lt: new Date(nowMs - SLA_DAYS * DAY) };

  const orderBy: Prisma.ApplicationItemOrderByWithRelationInput =
    sort === "newest"
      ? { submittedAt: "desc" }
      : sort === "employee"
        ? { application: { employee: { fullName: "asc" } } }
        : { submittedAt: "asc" };

  const [total, totalPending, items, periods, departments, cards] = await Promise.all([
    db.applicationItem.count({ where }),
    db.applicationItem.count({ where: { status: "PENDING" } }),
    db.applicationItem.findMany({
      where,
      include: {
        card: { include: { partner: true } },
        application: { include: { employee: true, period: true } },
      },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    db.employee.findMany({
      distinct: ["department"],
      select: { department: true },
      orderBy: { department: "asc" },
    }),
    db.benefitCard.findMany({
      where: { block: "FLEX" },
      select: { id: true, title: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: ReviewRow[] = items.map((it) => ({
    id: it.id,
    employee: it.application.employee.fullName,
    department: it.application.employee.department,
    card: it.card.title,
    partner: it.card.partner?.name ?? null,
    condition: it.card.condition,
    period: it.application.period.name,
    submittedAt: it.submittedAt ? it.submittedAt.toISOString() : null,
    overdue: !!it.submittedAt && nowMs - it.submittedAt.getTime() > SLA_DAYS * DAY,
  }));

  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (dept) p.set("dept", dept);
    if (period) p.set("period", period);
    if (card) p.set("card", card);
    if (sort !== "oldest") p.set("sort", sort);
    if (overdue) p.set("overdue", "1");
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/review?${s}` : "/review";
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Согласование заявок"
        description={`Позиций на рассмотрении: ${totalPending}${
          total !== totalPending ? ` · по фильтру: ${total}` : ""
        }`}
      />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Сотрудник
          <Input name="q" defaultValue={q} placeholder="ФИО" className="w-44 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Подразделение
          <Select name="dept" defaultValue={dept} className="w-auto py-1.5 text-sm">
            <option value="">Все</option>
            {departments.map((d) => (
              <option key={d.department} value={d.department}>
                {d.department}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Период
          <Select name="period" defaultValue={period} className="w-auto py-1.5 text-sm">
            <option value="">Все</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Льгота
          <Select name="card" defaultValue={card} className="w-auto py-1.5 text-sm">
            <option value="">Все</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Сортировка
          <Select name="sort" defaultValue={sort} className="w-auto py-1.5 text-sm">
            <option value="oldest">Сначала старые</option>
            <option value="newest">Сначала новые</option>
            <option value="employee">По сотруднику</option>
          </Select>
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-sm text-ink">
          <input
            type="checkbox"
            name="overdue"
            value="1"
            defaultChecked={overdue}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          только просроченные
        </label>
        <button className={buttonClass({ variant: "secondary", size: "sm" }) + " mb-0.5"}>
          Применить
        </button>
        {(q || dept || period || card || overdue || sort !== "oldest") && (
          <a href="/review" className="mb-2 text-xs text-ink-muted hover:text-ink hover:underline">
            сбросить
          </a>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState>
          {totalPending === 0
            ? "Нет позиций, ожидающих решения."
            : "По заданным фильтрам ничего не найдено."}
        </EmptyState>
      ) : (
        <>
          <ReviewTable rows={rows} />

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">
                Стр. {page} из {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <a
                    href={pageHref(page - 1)}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    Назад
                  </a>
                )}
                {page < pages && (
                  <a
                    href={pageHref(page + 1)}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    Вперёд
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
