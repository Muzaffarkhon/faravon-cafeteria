import type { Prisma } from "@prisma/client";
import { dateFilterField, defineColumns, selectFilterField, textFilterField } from "@/lib/smart-filter";

type W = Prisma.AdvertisingRequestWhereInput;

export const AD_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export const AD_PLATFORMS = ["ANDROID", "IOS"] as const;

export type AdvertisingColumnsCtx = { t(key: string): string; statusLabel(status: string): string };
const NO_LABELS: AdvertisingColumnsCtx = { t: (k) => k, statusLabel: (s) => s };

const hasUrl = (field: "androidUrl" | "iosUrl"): W => ({ AND: [{ [field]: { not: null } }, { [field]: { not: "" } }] });
const noUrl = (field: "androidUrl" | "iosUrl"): W => ({ OR: [{ [field]: null }, { [field]: "" }] });

/** Единственное описание таблицы «Мои заявки на рекламу»: заголовки, фильтры и условия запроса (см. lib/coupon-columns.ts). */
export function advertisingColumns(ctx: AdvertisingColumnsCtx = NO_LABELS) {
  const { t } = ctx;
  return defineColumns([
    { key: "id", label: t("advertising.colId") },
    {
      key: "product",
      label: t("advertising.colProduct"),
      filters: [
        textFilterField<W>("productName", "Продукт", (f) => ({ productName: f as Prisma.StringFilter })),
        textFilterField<W>("productDescription", "Описание", (f) => ({ productDescription: f as Prisma.StringFilter })),
      ],
    },
    {
      key: "app",
      label: t("advertising.colApp"),
      filters: [
        selectFilterField<W>(
          "platform",
          t("advertising.colApp"),
          [
            { value: "ANDROID", label: "Android" },
            { value: "IOS", label: "iOS" },
          ],
          (c) => {
            const value = c.equals ?? c.not;
            const field = value === "ANDROID" ? "androidUrl" : "iosUrl";
            return c.equals ? hasUrl(field) : noUrl(field);
          },
          AD_PLATFORMS,
        ),
      ],
    },
    {
      key: "status",
      label: t("advertising.colStatus"),
      filters: [
        selectFilterField<W>(
          "status",
          "Статус",
          AD_STATUSES.map((s) => ({ value: s, label: ctx.statusLabel(s) })),
          (c) => ({ status: c as W["status"] }),
          AD_STATUSES,
        ),
      ],
    },
    {
      key: "submitted",
      label: t("advertising.colSubmitted"),
      filters: [dateFilterField<W>("submittedAt", "Дата подачи", (f) => ({ submittedAt: f as Prisma.DateTimeFilter }))],
    },
  ]);
}

export type AdvertisingColKey = ReturnType<typeof advertisingColumns>[number]["key"];
