import "server-only";
import { db } from "@/lib/db";
import { asLocale, type Locale } from "@/lib/i18n/shared";
import { openOrReopenThread, appendGuestMessage } from "@/lib/support-chat";

const REPLY: Record<Locale, { yes: string; no: string; already: string }> = {
  ru: {
    yes: "Спасибо! Отметили ваш ответ «Да». Если появятся вопросы — напишите сюда, ответит администратор.",
    no: "Спасибо, отметили ответ «Нет». Напишите, пожалуйста, одним сообщением причину — администратор увидит её и ответит здесь.",
    already: "Ваш ответ уже учтён. Если что-то изменилось — напишите сюда, ответит администратор.",
  },
  tg: {
    yes: "Ташаккур! Ҷавоби «Ҳа»-и шумо қайд шуд. Агар савол пайдо шавад — ба ин ҷо нависед, администратор ҷавоб медиҳад.",
    no: "Ташаккур, ҷавоби «Не» қайд шуд. Лутфан сабабашро бо як паём нависед — администратор мебинад ва дар ин ҷо ҷавоб медиҳад.",
    already: "Ҷавоби шумо аллакай қайд шудааст. Агар чизе тағйир ёбад — ба ин ҷо нависед.",
  },
  uz: {
    yes: "Rahmat! «Ha» javobingiz qayd etildi. Savollar bo'lsa — shu yerga yozing, administrator javob beradi.",
    no: "Rahmat, «Yo'q» javobi qayd etildi. Iltimos, sababini bitta xabarda yozing — administrator ko'rib, shu yerda javob beradi.",
    already: "Javobingiz allaqachon qayd etilgan. Biror narsa o'zgargan bo'lsa — shu yerga yozing.",
  },
};

/**
 * Нажатие «Да / Нет» под рассылкой. Засчитывается первый ответ (условный UPDATE —
 * двойной тап не перезапишет). Ответ пишется в чат поддержки сотрудника:
 * «Нет» открывает диалог и зовёт C&B, «Да» ложится в историю тихо (прочитанным,
 * без уведомления), чтобы сотни «Да» не заваливали админов, — но тред уже есть,
 * и любой следующий вопрос сотрудника уйдёт в «Поддержку».
 * Возвращает текст ответа бота или null, если кнопка чужая/устарела.
 */
export async function answerBroadcastConfirm(params: {
  recipientId: string;
  answer: "YES" | "NO";
  telegramId: string;
}): Promise<string | null> {
  const rec = await db.broadcastRecipient.findUnique({
    where: { id: params.recipientId },
    include: {
      campaign: { select: { title: true } },
      user: { select: { telegramId: true, locale: true, employee: { select: { telegramId: true } } } },
    },
  });
  if (!rec) return null;
  if ((rec.user.telegramId ?? rec.user.employee?.telegramId) !== params.telegramId) return null;
  const locale = asLocale(rec.user.locale) ?? "ru";

  const claimed = await db.broadcastRecipient.updateMany({
    where: { id: rec.id, answer: null },
    data: { answer: params.answer, answeredAt: new Date() },
  });
  if (claimed.count === 0) return REPLY[locale].already;

  const line = `[Рассылка «${rec.campaign.title}»] Ответ: ${params.answer === "YES" ? "Да" : "Нет"}`;
  if (params.answer === "NO") {
    await openOrReopenThread(params.telegramId);
    await appendGuestMessage(params.telegramId, line);
  } else {
    const thread = await db.supportThread.upsert({
      where: { telegramId: params.telegramId },
      create: { telegramId: params.telegramId, status: "CLOSED" },
      update: {},
    });
    await db.supportMessage.create({ data: { threadId: thread.id, direction: "IN", body: line, readAt: new Date() } });
  }
  return params.answer === "YES" ? REPLY[locale].yes : REPLY[locale].no;
}
