import type { Prisma } from "@prisma/client";
import { ALL_ROLES } from "@/app/(admin)/admin/users/roles";
import { dateFilterField, defineColumns, selectFilterField, textFilterField } from "@/lib/smart-filter";

type W = Prisma.EmployeeWhereInput;
type Opt = { value: string; label: string };

export const EMPLOYMENT_STATUSES = ["ACTIVE", "PROBATION", "TERMINATED"] as const;
export const ACCOUNT_FILTER_STATES = ["active", "off", "none", "neverLoggedIn"] as const;
export const TELEGRAM_FILTER_STATES = ["yes", "no"] as const;

export type EmployeeColumnsCtx = { t(key: string): string; roles: Opt[]; empStatuses: Opt[] };
const NO_LABELS: EmployeeColumnsCtx = { t: (k) => k, roles: [], empStatuses: [] };

const not = (c: { equals?: string; not?: string }, w: W): W => (c.not ? { NOT: w } : w);

/**
 * Единственное описание таблицы «Пользователи» (для строк-сотрудников): заголовки, фильтры и условия
 * запроса (см. lib/coupon-columns.ts). Строки служебных учёток (_account.tsx) рисуются отдельным компонентом:
 * порядок их ячеек должен совпадать с этим списком. Фильтр Telegram живёт в колонке «Учётная запись» —
 * отдельной колонки Telegram в таблице нет.
 */
export function employeeColumns(ctx: EmployeeColumnsCtx = NO_LABELS) {
  const { t } = ctx;
  return defineColumns([
    { key: "id", label: t("users.colId") },
    { key: "type", label: t("users.colType") },
    {
      key: "account",
      label: t("users.colAccount"),
      filters: [
        textFilterField<W>("login", "Логин", (f) => ({ user: { is: { login: f as Prisma.StringFilter } } })),
        selectFilterField<W>(
          "role",
          t("users.roleLabel"),
          ctx.roles,
          (c) => not(c, { user: { is: { roles: { has: (c.equals ?? c.not) as (typeof ALL_ROLES)[number] } } } }),
          ALL_ROLES,
        ),
        selectFilterField<W>(
          "account",
          "Учётка",
          [
            { value: "active", label: "активна" },
            { value: "off", label: "отключена" },
            { value: "none", label: "без учётки" },
            { value: "neverLoggedIn", label: "есть учётка, но не входил" },
          ],
          (c) => {
            const v = c.equals ?? c.not;
            const w: W =
              v === "active"
                ? { user: { is: { isActive: true } } }
                : v === "off"
                  ? { user: { is: { isActive: false } } }
                  : v === "none"
                    ? { user: null }
                    : { user: { is: { lastLoginAt: null } } };
            return not(c, w);
          },
          ACCOUNT_FILTER_STATES,
        ),
        selectFilterField<W>(
          "tg",
          t("users.telegramLabel"),
          [
            { value: "yes", label: t("users.telegramLinked") },
            { value: "no", label: t("users.telegramNone") },
          ],
          (c) => not(c, (c.equals ?? c.not) === "yes" ? { telegramId: { not: null } } : { telegramId: null }),
          TELEGRAM_FILTER_STATES,
        ),
      ],
    },
    {
      key: "fullName",
      label: t("users.colFullName"),
      filters: [textFilterField<W>("fullName", "ФИО", (f) => ({ fullName: f as Prisma.StringFilter }))],
    },
    {
      key: "phone",
      label: t("users.colPhone"),
      filters: [textFilterField<W>("phone", "Телефон", (f) => ({ phone: f as Prisma.StringNullableFilter }))],
    },
    {
      key: "deptPartner",
      label: t("users.colDeptPartner"),
      filters: [textFilterField<W>("department", "Подразделение", (f) => ({ department: f as Prisma.StringFilter }))],
    },
    {
      key: "status",
      label: t("users.colStatus"),
      filters: [
        selectFilterField<W>(
          "emp",
          t("users.workLabel"),
          ctx.empStatuses,
          (c) => ({ status: c as W["status"] }),
          EMPLOYMENT_STATUSES,
        ),
      ],
    },
    {
      key: "lastLogin",
      label: t("users.colLastLogin"),
      filters: [
        dateFilterField<W>("lastLogin", "Последний вход", (f) => ({ user: { is: { lastLoginAt: f as Prisma.DateTimeNullableFilter } } })),
      ],
    },
    { key: "lastEdit", label: t("users.colLastEdit") },
    { key: "actions", label: t("users.colActions"), className: "text-right" },
  ]);
}

export type UserColKey = ReturnType<typeof employeeColumns>[number]["key"];

/** Сколько колонок в таблице — для colSpan и для строк служебных учёток. */
export const USER_TABLE_COLUMN_COUNT = employeeColumns().length;
