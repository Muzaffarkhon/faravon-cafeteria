/**
 * Кнопки «Да / Нет» рассылки с подтверждением. Без server-only: клавиатуру
 * прикладывает доставка уведомлений (notification-delivery.ts), которую
 * использует и бот-воркер вне Next.
 */
import type { Locale } from "./i18n/shared";

const PREFIX = "bc:";

const LABELS: Record<Locale, { yes: string; no: string }> = {
  ru: { yes: "✅ Да", no: "❌ Нет" },
  tg: { yes: "✅ Ҳа", no: "❌ Не" },
  uz: { yes: "✅ Ha", no: "❌ Yo'q" },
};

/** callback_data: `bc:y:<recipientId>` — в пределах лимита Telegram в 64 байта. */
export function confirmKeyboard(recipientId: string, locale: Locale) {
  const l = LABELS[locale];
  return {
    inline_keyboard: [
      [
        { text: l.yes, callback_data: `${PREFIX}y:${recipientId}` },
        { text: l.no, callback_data: `${PREFIX}n:${recipientId}` },
      ],
    ],
  };
}

export function parseConfirmCallback(data: string): { answer: "YES" | "NO"; recipientId: string } | null {
  const m = /^bc:([yn]):([a-z0-9]{10,40})$/.exec(data);
  return m ? { answer: m[1] === "y" ? "YES" : "NO", recipientId: m[2] } : null;
}

/** Напоминание «покажите купон на сайте» со ссылкой на раздел купонов. */
export function couponHintText(locale: Locale, siteUrl: string): string {
  const url = `${siteUrl.replace(/\/$/, "")}/applications`;
  switch (locale) {
    case "tg":
      return `Барои тасдиқи купон онро ба шарик аз бахши «Дархостҳо ва купонҳои ман» дар сайт нишон диҳед: ${url}`;
    case "uz":
      return `Kuponni tasdiqlash uchun uni hamkorga saytdagi «Mening arizalarim va kuponlarim» bo'limidan ko'rsating: ${url}`;
    default:
      return `Для подтверждения купона покажите его партнёру из раздела «Мои заявки и купоны» на сайте: ${url}`;
  }
}
