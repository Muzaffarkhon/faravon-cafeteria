import type { FeedbackStatus } from "@prisma/client";

/** Метки и тона статусов обратной связи (§3). */
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  NEW: "Новое",
  READ: "Прочитано",
  NOTED: "Принято к сведению",
  CLOSED: "Закрыто",
};

export const FEEDBACK_STATUS_TONE: Record<FeedbackStatus, string> = {
  NEW: "warning",
  READ: "brand",
  NOTED: "success",
  CLOSED: "neutral",
};

/** Порядок статусов для кнопок в админке. */
export const FEEDBACK_STATUS_ORDER: FeedbackStatus[] = ["NEW", "READ", "NOTED", "CLOSED"];
