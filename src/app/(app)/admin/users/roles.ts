import type { Role } from "@prisma/client";

/** Порядок ролей для чекбоксов управления доступом (§4). */
export const ALL_ROLES: Role[] = [
  "EMPLOYEE",
  "APPROVER",
  "HR_BP",
  "CONTENT_MANAGER",
  "ANALYST",
  "SUPERADMIN",
];
