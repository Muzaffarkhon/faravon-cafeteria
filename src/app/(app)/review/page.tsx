import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { businessDaysAgo, isSlaBreached } from "@/lib/business-days";
import { FilterChips, hiddenChipInputs } from "@/components/filter-chips";
import { SmartFilterButton } from "@/components/smart-filter";
import { parseSmartFilterParams, stringFilter, dateFilter, type SmartFilterField } from "@/lib/smart-filter";
import { getLocale, getTranslator } from "@/lib/i18n";
import { ReviewTable, type ReviewRow } from "./_table";

const PAGE_SIZE = 25;
const SLA_DAYS = 5; // §5.12: рабочих дней

type SP = {
  q?: string;
  dept?: string;
  period?: string;
  card?: string;
  sort?: string;
  overdue?: string;
  page?: string;
  [key: string]: string | undefined;
};

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

  const SMART_FIELDS: SmartFilterField[] = [
    { key: "phone", label: "Телефон сотрудника", type: "text" },
    { key: "partner", label: "Партнёр", type: "text" },
    { key: "condition", label: "Условие льготы", type: "text" },
    { key: "submittedAt", label: "Дата подачи", type: "date" },
  ];
  const smartValues = parseSmartFilterParams(sp, SMART_FIELDS);
  const smartFilters: Prisma.ApplicationItemWhereInput[] = [];
  const phoneF = stringFilter(smartValues.phone);
  if (phoneF) smartFilters.push({ application: { is: { employee: { is: { phone: phoneF } } } } });
  const partnerF = stringFilter(smartValues.partner);
  if (partnerF) smartFilters.push({ card: { is: { partner: { is: { name: partnerF } } } } });
  const conditionF = stringFilter(smartValues.condition);
  if (conditionF) smartFilters.push({ card: { is: { condition: conditionF } } });
  const submittedAtF = dateFilter(smartValues.submittedAt);
  if (submittedAtF) smartFilters.push({ submittedAt: submittedAtF });

  const where: Prisma.ApplicationItemWhereInput = { status: "PENDING" };
  if (Object.keys(appFilter).length) where.application = { is: appFilter };
  if (card) where.cardId = card;
  const slaCutoff = businessDaysAgo(SLA_DAYS);
  if (overdue) where.submittedAt = { lt: slaCutoff };
  if (smartFilters.length) where.AND = smartFilters;

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
    <div data-wide className="space-y-3">
      <PageHeader
        title={t("review.title")}
        description={`${t("review.pendingLabel")}: ${totalPending}${
          total !== totalPending ? ` · ${t("review.byFilter")}: ${total}` : ""
        }`}
      />

      <FilterChips
        basePath="/review"
        params={sp}
        groups={[
          {
            param: "overdue",
            label: t("review.slaLabel"),
            options: [{ value: "1", label: t("review.overdueOnly") }],
          },
          {
            param: "sort",
            label: t("review.orderLabel"),
            options: [
              { value: "oldest", label: t("review.sortOldest") },
              { value: "newest", label: t("review.sortNewest") },
              { value: "employee", label: t("review.sortByEmployee") },
            ],
          },
        ]}
      />

      {/* Одна строка вместо подписи-над-полем на каждый фильтр — то же самое
          читается через плейсхолдер поля и первый пункт списка («Все ...»),
          но не растягивает шапку страницы на 2 лишних яруса. */}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder={`${t("review.employeeLabel")}: ${t("review.employeeNamePlaceholder")}`}
          className="w-48 py-1.5 text-sm"
        />
        <Select name="dept" defaultValue={dept} className="w-auto py-1.5 text-sm">
          <option value="">{t("review.allDepartments")}</option>
          {departments.map((d) => (
            <option key={d.department} value={d.department}>
              {d.department}
            </option>
          ))}
        </Select>
        <Select name="period" defaultValue={period} className="w-auto py-1.5 text-sm">
          <option value="">{t("review.allPeriods")}</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="card" defaultValue={card} className="w-auto py-1.5 text-sm">
          <option value="">{t("review.allCards")}</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
        {hiddenChipInputs(sp, ["sort", "overdue", ...Object.keys(sp).filter((k) => k.startsWith("sf_"))])}
        <button className={buttonClass({ variant: "secondary", size: "sm" })}>{t("review.apply")}</button>
        <SmartFilterButton
          basePath="/review"
          params={sp}
          fields={SMART_FIELDS}
          extraParamKeys={["q", "dept", "period", "card", "sort", "overdue"]}
          presets={[{ id: "all", label: "Все записи", values: null }]}
        />
        {(q || dept || period || card || overdue || sort !== "oldest" || Object.keys(sp).some((k) => k.startsWith("sf_"))) && (
          <a href="/review" className="text-xs text-ink-muted hover:text-ink hover:underline">
            {t("review.reset")}
          </a>
        )}
      </form>

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
