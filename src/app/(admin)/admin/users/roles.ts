import type { Role } from "@prisma/client";

/** Порядок ролей для чекбоксов управления доступом (§4). */
export const ALL_ROLES: Role[] = [
  "EMPLOYEE",
  "C_AND_B",
  "CONTRACTOR",
];
