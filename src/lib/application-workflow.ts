import type { ItemStatus } from "@prisma/client";
import { translate, type TKey } from "./i18n/dict";
import type { Locale } from "./i18n/shared";

/** Диаграмма статусов позиции заявки, ТЗ v2 §5.7 / Приложение Б. */
export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  DRAFT: "Черновик",
  PENDING: "На рассмотрении",
  APPROVED: "Одобрено C&B",
  COUPON_CREATED: "Купон сформирован",
  COUPON_ISSUED: "Купон выдан",
  REJECTED: "Отклонено",
  CANCELLED: "Отменено сотрудником",
};

export function itemStatusLabel(locale: Locale, status: ItemStatus): string {
  return translate(locale, `status.item.${status}` as TKey);
}

type Actor = "EMPLOYEE" | "C_AND_B" | "CONTRACTOR";

const TRANSITIONS: Record<ItemStatus, { to: ItemStatus; by: Actor }[]> = {
  DRAFT: [
    { to: "PENDING", by: "EMPLOYEE" },
    { to: "CANCELLED", by: "EMPLOYEE" },
  ],
  PENDING: [
    { to: "APPROVED", by: "C_AND_B" },
    { to: "REJECTED", by: "C_AND_B" },
    { to: "CANCELLED", by: "EMPLOYEE" },
  ],
  // REJECTED — «убрать из очереди» одобренную, но ещё не превращённую в купон
  // позицию (см. rejectAwaitingItem в (app)/coupons/actions.ts).
  APPROVED: [
    { to: "COUPON_CREATED", by: "C_AND_B" },
    { to: "REJECTED", by: "C_AND_B" },
  ],
  COUPON_CREATED: [{ to: "COUPON_ISSUED", by: "C_AND_B" }],
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
