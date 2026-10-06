import type { Prisma } from "@prisma/client";
import { dateFilterField, defineColumns, textFilterField } from "@/lib/smart-filter";

type W = Prisma.ApplicationItemWhereInput;

export type TaxiColumnsCtx = { t(key: string): string };
const NO_LABELS: TaxiColumnsCtx = { t: (k) => k };

const employee = (w: Prisma.EmployeeWhereInput): W => ({ application: { is: { employee: { is: w } } } });

/**
 * Единственное описание таблицы «Одобренные сотрудники» (такси): заголовки, фильтры и условия запроса
 * (см. lib/coupon-columns.ts). Статус промокода считается отдельно от заявок — фильтра по нему нет.
 */
export function taxiColumns(ctx: TaxiColumnsCtx = NO_LABELS) {
  const { t } = ctx;
  return defineColumns([
    {
      key: "employee",
      label: t("providerTaxi.colEmployee"),
      filters: [textFilterField<W>("employee", "Сотрудник", (f) => employee({ fullName: f as Prisma.StringFilter }))],
    },
    {
      key: "department",
      label: t("providerTaxi.colDepartment"),
      filters: [textFilterField<W>("department", "Подразделение", (f) => employee({ department: f as Prisma.StringFilter }))],
    },
    {
      key: "phone",
      label: t("providerTaxi.colPhone"),
      filters: [
        textFilterField<W>("phone", "Телефон", (f) => ({
          OR: [{ contactPhone: f as Prisma.StringNullableFilter }, employee({ phone: f as Prisma.StringNullableFilter })],
        })),
      ],
    },
    {
      key: "card",
      label: t("providerTaxi.colCard"),
      filters: [textFilterField<W>("card", "Льгота", (f) => ({ card: { is: { title: f as Prisma.StringFilter } } }))],
    },
    {
      key: "period",
      label: t("providerTaxi.colPeriod"),
      filters: [
        textFilterField<W>("period", "Период", (f) => ({
          application: { is: { period: { is: { name: f as Prisma.StringFilter } } } },
        })),
      ],
    },
    {
      key: "approved",
      label: t("providerTaxi.colApproved"),
      filters: [dateFilterField<W>("approvedAt", "Дата одобрения", (f) => ({ decidedAt: f as Prisma.DateTimeNullableFilter }))],
    },
    { key: "promo", label: t("providerTaxi.colPromo") },
  ]);
}

export type TaxiColKey = ReturnType<typeof taxiColumns>[number]["key"];
