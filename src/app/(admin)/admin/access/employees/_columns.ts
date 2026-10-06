import type { Prisma } from "@prisma/client";
import { dateFilterField, defineColumns, selectFilterField, textFilterField } from "@/lib/smart-filter";

type W = Prisma.EmployeeWhereInput;

export const TELEGRAM_STATES = ["yes", "no"] as const;
export const ACCOUNT_STATES = ["none", "neverLoggedIn", "loggedIn"] as const;

export type AccessColumnsCtx = { t(key: string): string };
const NO_LABELS: AccessColumnsCtx = { t: (k) => k };

const not = (cond: { equals?: string; not?: string }, w: W): W => (cond.not ? { NOT: w } : w);

/** Единственное описание таблицы «Идентификация сотрудников»: заголовки, фильтры и условия запроса (см. lib/coupon-columns.ts). */
export function accessEmployeeColumns(ctx: AccessColumnsCtx = NO_LABELS) {
  const { t } = ctx;
  return defineColumns([
    { key: "id", label: t("access.colId") },
    {
      key: "employee",
      label: t("access.colEmployee"),
      filters: [textFilterField<W>("fullName", "ФИО", (f) => ({ fullName: f as Prisma.StringFilter }))],
    },
    {
      key: "department",
      label: t("access.colDepartment"),
      filters: [textFilterField<W>("department", "Подразделение", (f) => ({ department: f as Prisma.StringFilter }))],
    },
    {
      key: "phone",
      label: t("access.colPhone"),
      filters: [textFilterField<W>("phone", "Телефон", (f) => ({ phone: f as Prisma.StringNullableFilter }))],
    },
    {
      key: "telegram",
      label: t("access.colTelegram"),
      filters: [
        selectFilterField<W>(
          "telegram",
          "Telegram",
          [
            { value: "yes", label: t("access.linked") },
            { value: "no", label: t("access.notLinkedShort") },
          ],
          (c) => not(c, (c.equals ?? c.not) === "yes" ? { telegramId: { not: null } } : { telegramId: null }),
          TELEGRAM_STATES,
        ),
      ],
    },
    {
      key: "login",
      label: t("access.colLogin"),
      filters: [
        selectFilterField<W>(
          "account",
          "Учётка",
          [
            { value: "none", label: "без учётки" },
            { value: "neverLoggedIn", label: "есть учётка, но не входил" },
            { value: "loggedIn", label: "входил" },
          ],
          (c) => {
            const v = c.equals ?? c.not;
            const w: W =
              v === "none"
                ? { user: null }
                : v === "neverLoggedIn"
                  ? { user: { is: { lastLoginAt: null } } }
                  : { user: { is: { lastLoginAt: { not: null } } } };
            return not(c, w);
          },
          ACCOUNT_STATES,
        ),
        dateFilterField<W>("lastLogin", "Последний вход", (f) => ({ user: { is: { lastLoginAt: f as Prisma.DateTimeNullableFilter } } })),
      ],
    },
    { key: "actions", label: t("access.colActions"), className: "text-right" },
  ]);
}

export type AccessColKey = ReturnType<typeof accessEmployeeColumns>[number]["key"];
