import type { Prisma } from "@prisma/client";
import { defineColumns, selectFilterField, textFilterField } from "@/lib/smart-filter";

type W = Prisma.PartnerWhereInput;

export const PARTNER_STATUSES = ["ACTIVE", "SOON", "ARCHIVED"] as const;
export const PARTNER_MODES = ["QR", "PHONE_PROMO"] as const;

export type PartnerColumnsCtx = { t(key: string): string; statusLabel(status: string): string };
const NO_LABELS: PartnerColumnsCtx = { t: (k) => k, statusLabel: (s) => s };

/** Единственное описание таблицы «Партнёры»: заголовки, фильтры и условия запроса (см. lib/coupon-columns.ts). */
export function partnerColumns(ctx: PartnerColumnsCtx = NO_LABELS) {
  const { t } = ctx;
  return defineColumns([
    { key: "id", label: t("partners.colId") },
    {
      key: "name",
      label: t("partners.colName"),
      filters: [textFilterField<W>("name", "Название", (f) => ({ name: f as Prisma.StringFilter }))],
    },
    {
      key: "contractor",
      label: t("partners.colContractorAccount"),
      filters: [
        textFilterField<W>("contractorLogin", "Логин учётки контрагента", (f) => ({
          serviceUsers: { some: { login: f as Prisma.StringFilter } },
        })),
      ],
    },
    {
      key: "category",
      label: t("partners.colCategory"),
      filters: [textFilterField<W>("category", "Категория", (f) => ({ category: f as Prisma.StringNullableFilter }))],
    },
    {
      key: "discount",
      label: t("partners.colDiscount"),
      filters: [textFilterField<W>("discountType", "Скидка", (f) => ({ discountType: f as Prisma.StringNullableFilter }))],
    },
    { key: "cards", label: t("partners.colCards") },
    {
      key: "mode",
      label: t("partners.deliveryLabel"),
      filters: [
        selectFilterField<W>(
          "mode",
          t("partners.deliveryLabel"),
          [
            { value: "QR", label: t("partners.byQr") },
            { value: "PHONE_PROMO", label: t("partners.byPhone") },
          ],
          (c) => ({ deliveryMode: c as W["deliveryMode"] }),
          PARTNER_MODES,
        ),
      ],
    },
    {
      key: "status",
      label: t("partners.colStatus"),
      filters: [
        selectFilterField<W>(
          "status",
          t("partners.statusLabel"),
          PARTNER_STATUSES.map((s) => ({ value: s, label: ctx.statusLabel(s) })),
          (c) => ({ status: c as W["status"] }),
          PARTNER_STATUSES,
        ),
      ],
    },
    { key: "lastEdit", label: t("partners.colLastEdit") },
    { key: "actions", label: t("partners.colActions"), className: "text-right" },
  ]);
}

export type PartnerColKey = ReturnType<typeof partnerColumns>[number]["key"];
