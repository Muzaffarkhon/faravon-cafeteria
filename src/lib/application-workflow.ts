import type { ItemStatus } from "@prisma/client";

/** Диаграмма статусов позиции заявки, ТЗ v2 §5.7 / Приложение Б. */
export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  DRAFT: "Черновик",
  PENDING: "На рассмотрении",
  APPROVED: "Одобрено согласующим",
  COUPON_CREATED: "Купон сформирован",
  COUPON_ISSUED: "Купон выдан",
  REJECTED: "Отклонено",
  CANCELLED: "Отменено сотрудником",
};

type Actor = "EMPLOYEE" | "APPROVER" | "HR_BP";

const TRANSITIONS: Record<ItemStatus, { to: ItemStatus; by: Actor }[]> = {
  DRAFT: [
    { to: "PENDING", by: "EMPLOYEE" },
    { to: "CANCELLED", by: "EMPLOYEE" },
  ],
  PENDING: [
    { to: "APPROVED", by: "APPROVER" },
    { to: "REJECTED", by: "APPROVER" },
    { to: "CANCELLED", by: "EMPLOYEE" },
  ],
  APPROVED: [{ to: "COUPON_CREATED", by: "HR_BP" }],
  COUPON_CREATED: [{ to: "COUPON_ISSUED", by: "HR_BP" }],
  COUPON_ISSUED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const TERMINAL: ItemStatus[] = ["COUPON_ISSUED", "REJECTED", "CANCELLED"];

/** Позиции, занимающие лимит выбора (ТЗ v2 §5.6). */
export const ACTIVE_FOR_LIMIT: ItemStatus[] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "COUPON_CREATED",
  "COUPON_ISSUED",
];

export function canTransition(from: ItemStatus, to: ItemStatus, by: Actor): boolean {
  return TRANSITIONS[from].some((t) => t.to === to && t.by === by);
}

export function assertTransition(from: ItemStatus, to: ItemStatus, by: Actor) {
  if (!canTransition(from, to, by)) {
    throw new Error(`Недопустимый переход статуса: ${from} → ${to} (роль ${by})`);
  }
}
