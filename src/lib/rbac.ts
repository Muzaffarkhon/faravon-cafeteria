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

/** Человекочитаемые названия прав — для конструктора ролей и доступов. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "cards.manage": "Карточки, тексты, уведомления, SLA",
  "partners.manage": "Партнёры и баннеры",
  "periods.manage": "Периоды выбора льгот",
  "application.select": "Выбор льгот сотрудником",
  "applications.viewAll": "Просмотр всех заявок",
  "applications.decide": "Согласование заявок",
  "coupons.manage": "Формирование и выдача купонов",
  "coupons.confirm": "Погашение купонов (подрядчик)",
  "reports.view": "Отчёты и аналитика",
  "users.manage": "Пользователи и роли",
  "access.manage": "Доступ: Telegram / OTP",
  "audit.view": "Журнал аудита",
};

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Все права, которые дают перечисленные роли (объединение). */
export function permissionsForRoles(roles: Role[]): Permission[] {
  return ALL_PERMISSIONS.filter((p) => can(roles, p));
}

/** Права, которые даёт одна роль. */
export function permissionsOfRole(role: Role): Permission[] {
  return ALL_PERMISSIONS.filter((p) => (PERMISSIONS[p] as readonly Role[]).includes(role));
}

export const ROLE_LABELS: Record<Role, string> = {
  C_AND_B: "C&B",
  EMPLOYEE: "Сотрудник",
  CONTRACTOR: "Подрядчик",
};
