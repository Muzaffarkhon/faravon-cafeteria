import "server-only";
import type { Prisma } from "@prisma/client";
import { columnFilterValues, columnWhere, stringFilter } from "@/lib/smart-filter";
import { ALL_ROLES } from "@/app/(admin)/admin/users/roles";
import { ACCOUNT_FILTER_STATES, EMPLOYMENT_STATUSES, TELEGRAM_FILTER_STATES, employeeColumns } from "@/lib/employee-columns";

/** Строит фильтр сотрудников из query-параметров /admin/users — общее для самой
 *  страницы и её /admin/users/export, чтобы выгрузка всегда отражала то, что видно в таблице. */
export function buildEmployeeFilter(sp: Record<string, string | undefined>, archiveView: boolean) {
  const q = (sp.q ?? "").trim();
  const columns = employeeColumns();
  const values = columnFilterValues(sp, columns);
  const role = ALL_ROLES.find((r) => r === values.role?.v);
  const empStatus = EMPLOYMENT_STATUSES.find((s) => s === values.emp?.v);
  const tg = TELEGRAM_FILTER_STATES.find((v) => v === values.tg?.v);
  const acc = ACCOUNT_FILTER_STATES.find((v) => v === values.account?.v);
  const loginF = stringFilter(values.login);

  const where: Prisma.EmployeeWhereInput = {
    archivedAt: archiveView ? { not: null } : null,
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { department: { contains: q, mode: "insensitive" as const } },
            { user: { is: { login: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
    AND: columnWhere<Prisma.EmployeeWhereInput>(sp, columns),
  };

  return { where, q, role, acc, empStatus, tg, loginF };
}
