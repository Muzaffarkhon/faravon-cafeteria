import type { Role } from "@prisma/client";

/** Роли, которым осмысленно слать SLA-эскалацию (без обычного сотрудника). */
export const ESCALATABLE_ROLES: Role[] = [
  "APPROVER",
  "HR_BP",
  "SUPERADMIN",
  "CONTENT_MANAGER",
  "ANALYST",
];
