/**
 * Форматирование уведомлений (§5.10). Модуль без server-only —
 * используется и веб-приложением, и Telegram-ботом (bot/notifications.ts).
 */

export const NOTIFICATION_LABELS: Record<string, string> = {
  APPLICATION_SUBMITTED: "Новая заявка на согласование",
  ITEM_APPROVED: "Позиция заявки одобрена",
  ITEM_REJECTED: "Позиция заявки отклонена",
  COUPON_CREATED: "Купон сформирован",
  COUPON_ISSUED: "Купон выдан",
};

type Payload = Record<string, unknown> | null | undefined;

const str = (v: unknown) => (v == null ? "" : String(v));

/** Человекочитаемый текст уведомления для Telegram/списка. */
export function formatNotificationText(event: string, payload: Payload): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (event) {
    case "APPLICATION_SUBMITTED": {
      const who = str(p.employee);
      const dept = p.department ? `, ${str(p.department)}` : "";
      const count = Number(p.count) || 0;
      const period = p.period ? ` (период: ${str(p.period)})` : "";
      const noun =
        count % 10 === 1 && count % 100 !== 11
          ? "позицию"
          : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)
            ? "позиции"
            : "позиций";
      return `${who}${dept} подал(а) на согласование ${count} ${noun}${period}. Откройте раздел «Согласование».`;
    }
    case "ITEM_APPROVED":
      return `Ваша позиция «${str(p.card)}» одобрена согласующим.`;
    case "ITEM_REJECTED":
      return `Ваша позиция «${str(p.card)}» отклонена.${p.comment ? ` Причина: ${str(p.comment)}` : ""}`;
    case "COUPON_CREATED":
      return `По льготе «${str(p.card)}» сформирован купон${p.number ? ` № ${str(p.number)}` : ""}.`;
    case "COUPON_ISSUED":
      return `Купон${p.number ? ` № ${str(p.number)}` : ""} по льготе «${str(p.card)}» выдан.`;
    default:
      return NOTIFICATION_LABELS[event] ?? event;
  }
}
