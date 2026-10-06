import type { Prisma } from "@prisma/client";
import { dateFilterField, defineColumns, numberFilterField, textFilterField } from "@/lib/smart-filter";

type W = Prisma.SatisfactionResponseWhereInput;

export type SatisfactionColumnsCtx = { t(key: string): string };
const NO_LABELS: SatisfactionColumnsCtx = { t: (k) => k };

/** Единственное описание таблицы «Оценки»: заголовки, фильтры и условия запроса (см. lib/coupon-columns.ts). */
export function satisfactionColumns(ctx: SatisfactionColumnsCtx = NO_LABELS) {
  const { t } = ctx;
  return defineColumns([
    { key: "id", label: t("satisfactionAdmin.colId") },
    {
      key: "employee",
      label: t("satisfactionAdmin.colEmployee"),
      filters: [
        textFilterField<W>("employee", "Сотрудник", (f) => ({ employee: { is: { fullName: f as Prisma.StringFilter } } })),
        textFilterField<W>("department", "Подразделение", (f) => ({ employee: { is: { department: f as Prisma.StringFilter } } })),
      ],
    },
    {
      key: "rating",
      label: t("satisfactionAdmin.colRating"),
      filters: [numberFilterField<W>("rating", "Оценка", (f) => ({ rating: f as Prisma.IntFilter }))],
    },
    {
      key: "comment",
      label: t("satisfactionAdmin.colComment"),
      filters: [textFilterField<W>("comment", "Комментарий", (f) => ({ comment: f as Prisma.StringNullableFilter }))],
    },
    {
      key: "when",
      label: t("satisfactionAdmin.colWhen"),
      filters: [dateFilterField<W>("createdAt", "Дата", (f) => ({ createdAt: f as Prisma.DateTimeFilter }))],
    },
  ]);
}

export type SatisfactionColKey = ReturnType<typeof satisfactionColumns>[number]["key"];
