import type { Prisma } from "@prisma/client";
import { dateFilterField, defineColumns, selectFilterField, textFilterField } from "@/lib/smart-filter";

type W = Prisma.AuditLogWhereInput;
type Opt = { value: string; label: string };

export type AuditColumnsCtx = { t(key: string): string; actions: Opt[]; entities: Opt[] };
const NO_LABELS: AuditColumnsCtx = { t: (k) => k, actions: [], entities: [] };

/** Единственное описание таблицы «Журнал аудита»: заголовки, фильтры и условия запроса (см. lib/coupon-columns.ts). */
export function auditColumns(ctx: AuditColumnsCtx = NO_LABELS) {
  const { t } = ctx;
  return defineColumns([
    {
      key: "time",
      label: t("audit.colTime"),
      filters: [dateFilterField<W>("createdAt", "Дата", (f) => ({ createdAt: f as Prisma.DateTimeFilter }))],
    },
    {
      key: "who",
      label: t("audit.colWho"),
      filters: [textFilterField<W>("actor", "Кто", (f) => ({ actor: { is: { login: f as Prisma.StringFilter } } }))],
    },
    {
      key: "action",
      label: t("audit.colAction"),
      filters: [selectFilterField<W>("action", t("audit.actionLabel"), ctx.actions, (c) => ({ action: c }))],
    },
    {
      key: "object",
      label: t("audit.colObject"),
      filters: [
        selectFilterField<W>("entityType", t("audit.entityTypeLabel"), ctx.entities, (c) => ({ entityType: c })),
        textFilterField<W>("entityId", t("audit.entityIdLabel"), (f) => ({ entityId: f as Prisma.StringNullableFilter })),
      ],
    },
    { key: "change", label: t("audit.colChange") },
  ]);
}

export type AuditColKey = ReturnType<typeof auditColumns>[number]["key"];
