import type { Role } from "@prisma/client";

/** Матрица прав, ТЗ v2 §4.2. Ключ — действие, значение — роли, которым оно разрешено. */
export const PERMISSIONS = {
  "cards.manage": ["C_AND_B"],
  "partners.manage": ["C_AND_B"],
  "periods.manage": ["C_AND_B"],
  "application.select": ["EMPLOYEE"],
  "applications.viewAll": ["C_AND_B"],
  "applications.decide": ["C_AND_B"],
  "coupons.manage": ["C_AND_B"],
  "coupons.confirm": ["CONTRACTOR"],
  "reports.view": ["C_AND_B"],
  "users.manage": ["C_AND_B"],
  "access.manage": ["C_AND_B"],
  "audit.view": ["C_AND_B"],
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
  C_AND_B: "C&B",
  EMPLOYEE: "Сотрудник",
  CONTRACTOR: "Подрядчик",
};
