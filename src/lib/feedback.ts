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

/**
 * Обращение движется только вперёд: Новое → Прочитано → Принято к сведению →
 * Закрыто. Возврат назад запрещён, у закрытого переходов нет — иначе статус
 * перестаёт что-либо значить. Список используют и кнопки в админке, и
 * серверный экшен: проверка на клиенте сама по себе ничего не гарантирует.
 */
export const FEEDBACK_NEXT_STATUSES: Record<FeedbackStatus, FeedbackStatus[]> = {
  NEW: ["READ", "NOTED", "CLOSED"],
  READ: ["NOTED", "CLOSED"],
  NOTED: ["CLOSED"],
  CLOSED: [],
};
