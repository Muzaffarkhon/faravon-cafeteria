import type { Prisma } from "@prisma/client";
import { businessDaysAgo } from "@/lib/business-days";
import { dateFilterField, defineColumns, selectFilterField, textFilterField } from "@/lib/smart-filter";

type W = Prisma.ApplicationItemWhereInput;
type Opt = { value: string; label: string };

/** §5.12: срок согласования в рабочих днях. */
export const SLA_DAYS = 5;

export type ReviewColumnsCtx = { t(key: string): string; departments: Opt[]; periods: Opt[]; cards: Opt[] };
const NO_LABELS: ReviewColumnsCtx = { t: (k) => k, departments: [], periods: [], cards: [] };

const employee = (w: Prisma.EmployeeWhereInput): W => ({ application: { is: { employee: { is: w } } } });

/**
 * Единственное описание таблицы «Согласование»: заголовки, фильтры и условия запроса (см. lib/coupon-columns.ts).
 * «Порядок» сортировки — не условие, его добавляет страница.
 */
export function reviewColumns(ctx: ReviewColumnsCtx = NO_LABELS) {
  const { t } = ctx;
  return defineColumns([
    { key: "select", label: "", className: "w-8" },
    { key: "id", label: t("review.colId") },
    {
      key: "employee",
      label: t("review.colEmployee"),
      filters: [
        textFilterField<W>("employee", "ФИО сотрудника", (f) => employee({ fullName: f as Prisma.StringFilter })),
        selectFilterField<W>("department", "Подразделение", ctx.departments, (c) => employee({ department: c })),
        textFilterField<W>("phone", "Телефон сотрудника", (f) => employee({ phone: f as Prisma.StringNullableFilter })),
      ],
    },
    {
      key: "cardPartner",
      label: t("review.colCardPartner"),
      filters: [
        selectFilterField<W>("card", "Льгота", ctx.cards, (c) => ({ cardId: c })),
        textFilterField<W>("partner", "Партнёр", (f) => ({ card: { is: { partner: { is: { name: f as Prisma.StringFilter } } } } })),
        textFilterField<W>("condition", "Условие льготы", (f) => ({ card: { is: { condition: f as Prisma.StringNullableFilter } } })),
      ],
    },
    {
      key: "period",
      label: t("review.colPeriod"),
      filters: [selectFilterField<W>("period", "Период", ctx.periods, (c) => ({ application: { is: { periodId: c } } }))],
    },
    {
      key: "submitted",
      label: t("review.colSubmitted"),
      filters: [
        dateFilterField<W>("submittedAt", "Дата подачи", (f) => ({ submittedAt: f as Prisma.DateTimeNullableFilter })),
        selectFilterField<W>(
          "overdue",
          t("review.slaLabel"),
          [{ value: "1", label: t("review.overdueOnly") }],
          () => ({ submittedAt: { lt: businessDaysAgo(SLA_DAYS) } }),
          ["1"],
        ),
      ],
    },
    { key: "actions", label: t("review.colActions"), className: "text-right" },
  ]);
}

export type ReviewColKey = ReturnType<typeof reviewColumns>[number]["key"];
