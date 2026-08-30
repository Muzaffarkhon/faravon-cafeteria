import type { Role } from "@prisma/client";

/** Матрица прав, ТЗ v2 §4.2. Ключ — действие, значение — роли, которым оно разрешено. */
export const PERMISSIONS = {
  "cards.manage": ["CONTENT_MANAGER", "SUPERADMIN"],
  "partners.manage": ["CONTENT_MANAGER", "SUPERADMIN"],
  "periods.manage": ["CONTENT_MANAGER", "SUPERADMIN"],
  "application.select": ["EMPLOYEE"],
  "applications.viewAll": ["CONTENT_MANAGER", "APPROVER", "HR_BP", "SUPERADMIN", "ANALYST"],
  "applications.decide": ["APPROVER"],
  "coupons.manage": ["HR_BP", "SUPERADMIN"],
  "reports.view": ["CONTENT_MANAGER", "APPROVER", "HR_BP", "SUPERADMIN", "ANALYST"],
  "users.manage": ["SUPERADMIN"],
  "access.manage": ["HR_BP", "SUPERADMIN"],
  "audit.view": ["SUPERADMIN", "ANALYST"],
} as const satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: Role[], permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly Role[];
  return roles.some((r) => allowed.includes(r));
}

export function assertCan(roles: Role[], permission: Permission) {
  if (!can(roles, permission)) throw new Error(`FORBIDDEN: ${permission}`);
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Суперадмин",
  CONTENT_MANAGER: "Контент-менеджер",
  APPROVER: "Согласующий",
  HR_BP: "HR BP",
  ANALYST: "Аналитик",
  EMPLOYEE: "Сотрудник",
};
