import type { Prisma } from "@prisma/client";
import { defineColumns, dateFilterField, selectFilterField, textFilterField } from "@/lib/smart-filter";

type W = Prisma.CouponWhereInput;
type Opt = { value: string; label: string };

export const COUPON_STATUSES = ["CREATED", "ISSUED", "USED", "EXPIRED", "CANCELLED"] as const;
export const BENEFIT_MODES = ["ONE_TIME", "PERIOD", "CASHBACK"] as const;

export type CouponColumnsCtx = {
  t(key: string): string;
  statusLabel(status: string): string;
  periods: Opt[];
  partners: Opt[];
};

// Без контекста (серверный разбор адреса, выгрузка) подписи не нужны — нужны только условия запроса.
const NO_LABELS: CouponColumnsCtx = { t: (k) => k, statusLabel: (s) => s, periods: [], partners: [] };

/**
 * Единственное описание таблицы «Реестр купонов»: заголовки, фильтры и условия запроса.
 * Новая колонка = одна запись здесь + ячейка в `cells` страницы (TypeScript не даст забыть).
 * Колонка без `filters` в окне «Фильтры» не появится — это нужно указать явно.
 */
export function couponColumns(ctx: CouponColumnsCtx = NO_LABELS) {
  const { t } = ctx;
  return defineColumns([
    { key: "select", label: "", className: "w-10" },
    {
      key: "number",
      label: t("coupons.colNumber"),
      filters: [textFilterField<W>("number", "Номер купона", (f) => ({ number: f as Prisma.StringFilter }))],
    },
    {
      key: "employee",
      label: t("coupons.colEmployee"),
      filters: [
        textFilterField<W>("employee", t("coupons.colEmployee"), (f) => ({ employee: { is: { fullName: f as Prisma.StringFilter } } })),
        textFilterField<W>("department", t("coupons.colDepartment"), (f) => ({ employee: { is: { department: f as Prisma.StringFilter } } })),
      ],
    },
    {
      key: "cardPartner",
      label: t("coupons.colCardPartner"),
      filters: [
        textFilterField<W>("card", "Льгота", (f) => ({ item: { is: { card: { is: { title: f as Prisma.StringFilter } } } } })),
        textFilterField<W>("partnerName", "Партнёр", (f) => ({ partner: { is: { name: f as Prisma.StringFilter } } })),
        selectFilterField<W>("partner", t("coupons.allPartners"), ctx.partners, (c) => ({ partnerId: c })),
      ],
    },
    {
      key: "condition",
      label: t("coupons.colCondition"),
      filters: [textFilterField<W>("nominal", t("coupons.colCondition"), (f) => ({ nominal: f as Prisma.StringNullableFilter }))],
    },
    {
      key: "mode",
      label: t("coupons.colMode"),
      filters: [
        selectFilterField<W>(
          "benefitMode",
          t("coupons.colMode"),
          BENEFIT_MODES.map((value) => ({ value, label: t(`coupons.mode.${value}`) })),
          (c) => ({ benefitMode: c as W["benefitMode"] }),
          BENEFIT_MODES,
        ),
      ],
    },
    // Тип и канал сейчас у всех купонов одинаковые (промокод / портал) — фильтровать нечего.
    { key: "type", label: t("coupons.colType") },
    { key: "channel", label: t("coupons.colChannel") },
    {
      key: "period",
      label: t("coupons.colPeriod"),
      filters: [selectFilterField<W>("period", t("coupons.colPeriod"), ctx.periods, (c) => ({ periodId: c }))],
    },
    {
      key: "createdAt",
      label: t("coupons.colCreatedAt"),
      filters: [dateFilterField<W>("createdAt", t("coupons.colCreatedAt"), (f) => ({ createdAt: f as Prisma.DateTimeFilter }))],
    },
    {
      key: "issuedAt",
      label: t("coupons.colIssuedAt"),
      filters: [dateFilterField<W>("issuedAt", t("coupons.colIssuedAt"), (f) => ({ issuedAt: f as Prisma.DateTimeNullableFilter }))],
    },
    {
      key: "activatedAt",
      label: t("coupons.colActivatedAt"),
      filters: [dateFilterField<W>("activatedAt", t("coupons.colActivatedAt"), (f) => ({ activatedAt: f as Prisma.DateTimeNullableFilter }))],
    },
    {
      key: "validUntil",
      label: t("coupons.colValidUntil"),
      filters: [dateFilterField<W>("validUntil", t("coupons.colValidUntil"), (f) => ({ validUntil: f as Prisma.DateTimeNullableFilter }))],
    },
    {
      key: "status",
      label: t("coupons.colStatus"),
      filters: [
        selectFilterField<W>(
          "status",
          t("coupons.statusLabel"),
          COUPON_STATUSES.map((value) => ({ value, label: ctx.statusLabel(value) })),
          (c) => ({ status: c as W["status"] }),
          COUPON_STATUSES,
        ),
      ],
    },
    { key: "actions", label: t("coupons.colActions"), className: "text-right" },
  ]);
}

export type CouponColKey = ReturnType<typeof couponColumns>[number]["key"];
