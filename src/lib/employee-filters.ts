import "server-only";
import type { EmploymentStatus, Prisma } from "@prisma/client";
import { parseSmartFilterParams, stringFilter, dateFilter, type SmartFilterField } from "@/lib/smart-filter";
import { ALL_ROLES } from "@/app/(admin)/admin/users/roles";

const EMPLOYMENT_STATUSES: EmploymentStatus[] = ["ACTIVE", "PROBATION", "TERMINATED"];

const USER_FILTER_FIELDS: SmartFilterField[] = [
  { key: "fullName", label: "", type: "text" },
  { key: "login", label: "", type: "text" },
  { key: "department", label: "", type: "text" },
  { key: "phone", label: "", type: "text" },
  { key: "role", label: "", type: "select" },
  { key: "account", label: "", type: "select" },
  { key: "lastLogin", label: "", type: "date" },
  { key: "emp", label: "", type: "select" },
  { key: "tg", label: "", type: "select" },
];

/** Строит фильтр сотрудников из query-параметров /admin/users — общее для самой
 *  страницы и её /admin/users/export, чтобы выгрузка всегда отражала то, что видно в таблице. */
export function buildEmployeeFilter(sp: Record<string, string | undefined>, archiveView: boolean) {
  const q = (sp.q ?? "").trim();
  const smartValues = parseSmartFilterParams(sp, USER_FILTER_FIELDS);
  const role = ALL_ROLES.find((r) => r === smartValues.role?.v);
  const empStatus = EMPLOYMENT_STATUSES.find((s) => s === smartValues.emp?.v);
  const tg = (["yes", "no"] as const).find((v) => v === smartValues.tg?.v);
  const acc = (["active", "off", "none", "neverLoggedIn"] as const).find(
    (v) => v === smartValues.account?.v,
  );

  const empFilters: Prisma.EmployeeWhereInput[] = [];
  if (role) empFilters.push({ user: { is: { roles: { has: role } } } });
  if (acc === "active") empFilters.push({ user: { is: { isActive: true } } });
  if (acc === "off") empFilters.push({ user: { is: { isActive: false } } });
  if (acc === "none") empFilters.push({ user: null });
  if (acc === "neverLoggedIn") empFilters.push({ user: { is: { lastLoginAt: null } } });
  if (empStatus) empFilters.push({ status: empStatus });
  if (tg) empFilters.push({ telegramId: tg === "yes" ? { not: null } : null });
  const fullNameF = stringFilter(smartValues.fullName);
  if (fullNameF) empFilters.push({ fullName: fullNameF });
  const loginF = stringFilter(smartValues.login);
  if (loginF) empFilters.push({ user: { is: { login: loginF } } });
  const deptF = stringFilter(smartValues.department);
  if (deptF) empFilters.push({ department: deptF });
  const phoneF = stringFilter(smartValues.phone);
  if (phoneF) empFilters.push({ phone: phoneF });
  const lastLoginF = dateFilter(smartValues.lastLogin);
  if (lastLoginF) empFilters.push({ user: { is: { lastLoginAt: lastLoginF } } });

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
    ...(empFilters.length ? { AND: empFilters } : {}),
  };

  return { where, q, role, acc, empStatus, tg, loginF };
}
