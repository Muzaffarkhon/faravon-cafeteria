import type { Role } from "@prisma/client";

/**
 * Матрица прав по умолчанию (ТЗ v2 §4.2). Ключ — действие, значение — роли.
 * Это резерв: реальная матрица хранится в таблице `RolePermission` и
 * подгружается через `ensureRbac()` (src/lib/rbac-load.ts). Если строки для
 * права в БД нет — берётся значение отсюда.
 */
export const DEFAULT_PERMISSIONS = {
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

export type Permission = keyof typeof DEFAULT_PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(DEFAULT_PERMISSIONS) as Permission[];

/** Действующая матрица. Стартует с дефолта, перезаписывается из БД. */
let matrix: Record<Permission, Role[]> = cloneDefaults();

function cloneDefaults(): Record<Permission, Role[]> {
  const out = {} as Record<Permission, Role[]>;
  for (const p of ALL_PERMISSIONS) out[p] = [...DEFAULT_PERMISSIONS[p]];
  return out;
}

/**
 * Применить строки из таблицы `RolePermission`. Для прав, по которым строк нет
 * вовсе, оставляем значение по умолчанию.
 */
export function setRbacMatrix(rows: { role: Role; permission: string; allowed: boolean }[]) {
  const next = {} as Record<Permission, Role[]>;
  const seen = new Set<string>();
  for (const p of ALL_PERMISSIONS) next[p] = [];
  for (const row of rows) {
    if (!(row.permission in next)) continue; // неизвестное право — игнор
    seen.add(row.permission);
    if (row.allowed) next[row.permission as Permission].push(row.role);
  }
  for (const p of ALL_PERMISSIONS) {
    if (!seen.has(p)) next[p] = [...DEFAULT_PERMISSIONS[p]];
  }
  matrix = next;
}

/** Сбросить матрицу к значениям по умолчанию (для тестов). */
export function resetRbacMatrix() {
  matrix = cloneDefaults();
}

export function can(roles: Role[], permission: Permission): boolean {
  const allowed = matrix[permission] ?? DEFAULT_PERMISSIONS[permission] ?? [];
  return roles.some((r) => allowed.includes(r));
}

export function assertCan(roles: Role[], permission: Permission) {
  if (!can(roles, permission)) throw new Error(`FORBIDDEN: ${permission}`);
}

/** Все права, которые дают перечисленные роли (объединение). */
export function permissionsForRoles(roles: Role[]): Permission[] {
  return ALL_PERMISSIONS.filter((p) => can(roles, p));
}

/** Права, которые даёт одна роль. */
export function permissionsOfRole(role: Role): Permission[] {
  return ALL_PERMISSIONS.filter((p) => (matrix[p] ?? DEFAULT_PERMISSIONS[p]).includes(role));
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
  "coupons.confirm": "Активация купонов (подрядчик)",
  "reports.view": "Отчёты и аналитика",
  "users.manage": "Пользователи и роли",
  "access.manage": "Доступ: матрица прав, Telegram / OTP",
  "audit.view": "Журнал аудита",
};

export const ROLE_LABELS: Record<Role, string> = {
  C_AND_B: "C&B",
  EMPLOYEE: "Сотрудник",
  CONTRACTOR: "Подрядчик",
};
