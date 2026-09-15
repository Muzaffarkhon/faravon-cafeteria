import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { businessDaysAgo, isSlaBreached } from "@/lib/business-days";
import { SmartFilterButton } from "@/components/smart-filter";
import { QuickSearch } from "@/components/quick-search";
import { parseSmartFilterParams, stringFilter, dateFilter, type SmartFilterField } from "@/lib/smart-filter";
import { getLocale, getTranslator } from "@/lib/i18n";
import { ReviewTable, type ReviewRow } from "./_table";

const PAGE_SIZE = 25;
const SLA_DAYS = 5; // §5.12: рабочих дней

type SP = { page?: string; [key: string]: string | undefined };

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "applications.decide")) redirect("/");

  const locale = await getLocale();
  const t = await getTranslator();

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [periods, departments, cards] = await Promise.all([
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

  // Единый умный фильтр — заменяет прежнюю строку из отдельных полей/чипов
  // (ФИО, подразделение, период, льгота, порядок, SLA): один видимый контрол
  // «Фильтры», всё остальное — внутри его панели.
  const SMART_FIELDS: SmartFilterField[] = [
    { key: "employee", label: "ФИО сотрудника", type: "text" },
    {
      key: "department",
      label: "Подразделение",
      type: "select",
      options: departments.map((d) => ({ value: d.department, label: d.department })),
    },
    { key: "period", label: "Период", type: "select", options: periods.map((p) => ({ value: p.id, label: p.name })) },
    { key: "card", label: "Льгота", type: "select", options: cards.map((c) => ({ value: c.id, label: c.title })) },
    {
      key: "sort",
      label: "Порядок",
      type: "select",
      options: [
        { value: "oldest", label: t("review.sortOldest") },
        { value: "newest", label: t("review.sortNewest") },
        { value: "employee", label: t("review.sortByEmployee") },
      ],
    },
    {
      key: "overdue",
      label: t("review.slaLabel"),
      type: "select",
      options: [{ value: "1", label: t("review.overdueOnly") }],
    },
    { key: "phone", label: "Телефон сотрудника", type: "text" },
    { key: "partner", label: "Партнёр", type: "text" },
    { key: "condition", label: "Условие льготы", type: "text" },
    { key: "submittedAt", label: "Дата подачи", type: "date" },
  ];
  const smartValues = parseSmartFilterParams(sp, SMART_FIELDS);

  const dept = smartValues.department?.v ?? "";
  const period = smartValues.period?.v ?? "";
  const card = smartValues.card?.v ?? "";
  const sortRaw = smartValues.sort?.v;
  const sort = sortRaw === "newest" || sortRaw === "employee" ? sortRaw : "oldest";
  const overdue = smartValues.overdue?.v === "1";

  const nameF = stringFilter(smartValues.employee);
  const appFilter: Prisma.ApplicationWhereInput = {};
  if (period) appFilter.periodId = period;
  if (dept || nameF) {
    appFilter.employee = {
      is: {
        ...(dept ? { department: dept } : {}),
        ...(nameF ? { fullName: nameF } : {}),
      },
    };
  }

  const smartFilters: Prisma.ApplicationItemWhereInput[] = [];
  const phoneF = stringFilter(smartValues.phone);
  if (phoneF) smartFilters.push({ application: { is: { employee: { is: { phone: phoneF } } } } });
  const partnerF = stringFilter(smartValues.partner);
  if (partnerF) smartFilters.push({ card: { is: { partner: { is: { name: partnerF } } } } });
  const conditionF = stringFilter(smartValues.condition);
  if (conditionF) smartFilters.push({ card: { is: { condition: conditionF } } });
  const submittedAtF = dateFilter(smartValues.submittedAt);
  if (submittedAtF) smartFilters.push({ submittedAt: submittedAtF });

  const q = (sp.q ?? "").trim();
  const where: Prisma.ApplicationItemWhereInput = { status: "PENDING" };
  if (Object.keys(appFilter).length) where.application = { is: appFilter };
  if (card) where.cardId = card;
  const slaCutoff = businessDaysAgo(SLA_DAYS);
  if (overdue) where.submittedAt = { lt: slaCutoff };
  if (smartFilters.length) where.AND = smartFilters;
  if (q) {
    where.OR = [
      { application: { is: { employee: { is: { fullName: { contains: q, mode: "insensitive" } } } } } },
      { application: { is: { employee: { is: { department: { contains: q, mode: "insensitive" } } } } } },
      { card: { is: { title: { contains: q, mode: "insensitive" } } } },
      { card: { is: { partner: { is: { name: { contains: q, mode: "insensitive" } } } } } },
    ];
  }

  const orderBy: Prisma.ApplicationItemOrderByWithRelationInput =
    sort === "newest"
      ? { submittedAt: "desc" }
      : sort === "employee"
        ? { application: { employee: { fullName: "asc" } } }
        : { submittedAt: "asc" };

  const [total, totalPending, items] = await Promise.all([
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
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: ReviewRow[] = items.map((it) => ({
    id: it.id,
    seq: it.seq,
    employee: it.application.employee.fullName,
    department: it.application.employee.department,
    phone: it.application.employee.phone,
    card: it.card.title,
    partner: it.card.partner?.name ?? null,
    condition: it.card.condition,
    period: it.application.period.name,
    submittedAt: it.submittedAt ? it.submittedAt.toISOString() : null,
    overdue: !!it.submittedAt && isSlaBreached(it.submittedAt, SLA_DAYS),
  }));

  const hasFilters = !!q || Object.keys(sp).some((k) => k.startsWith("sf_"));

  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") p.set(k, v);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/review?${s}` : "/review";
  };

  return (
    <div data-wide className="space-y-3">
      <PageHeader
        title={t("review.title")}
        description={`${t("review.pendingLabel")}: ${totalPending}${
          total !== totalPending ? ` · ${t("review.byFilter")}: ${total}` : ""
        }`}
      />

      <div className="flex items-center gap-2">
        <QuickSearch basePath="/review" sp={sp} placeholder="Сотрудник, льгота, партнёр…" />
        <SmartFilterButton
          basePath="/review"
          params={sp}
          fields={SMART_FIELDS}
          extraParamKeys={[]}
          presets={[{ id: "all", label: "Все записи", values: null }]}
        />
        {hasFilters && (
          <a href="/review" className="text-xs text-ink-muted hover:text-ink hover:underline">
            {t("review.reset")}
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState>
          {totalPending === 0 ? t("review.emptyNoPending") : t("review.emptyNoMatch")}
        </EmptyState>
      ) : (
        <>
          <ReviewTable rows={rows} locale={locale} />

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">
                {t("review.pagePrefix")} {page} {t("review.pageOf")} {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <a
                    href={pageHref(page - 1)}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    {t("review.back")}
                  </a>
                )}
                {page < pages && (
                  <a
                    href={pageHref(page + 1)}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    {t("review.next")}
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
