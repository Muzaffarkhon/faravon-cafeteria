import "server-only";
import { db } from "@/lib/db";

/**
 * Заводит или переоткрывает тред поддержки для этого Telegram-чата.
 * Вызывается по нажатию кнопки «Написать администратору» — до первого
 * реального сообщения гостя.
 */
export async function openOrReopenThread(telegramId: string): Promise<void> {
  await db.supportThread.upsert({
    where: { telegramId },
    create: { telegramId, status: "OPEN" },
    update: { status: "OPEN" },
  });
}

/**
 * Сохраняет сообщение гостя в его тред, если тред существует (открыт или
 * ранее был закрыт — тогда переоткрывает). Возвращает `false`, если треда
 * нет вовсе — тогда вызывающий код должен обработать сообщение как обычно
 * (например, показать WELCOME), а не как реплику в чате.
 *
 * C&B узнаёт о новом сообщении не через Telegram (это заваливало бы их же
 * бота на каждую реплику гостя), а через звук и мигание заголовка вкладки
 * прямо в интерфейсе — см. `_support-alert.tsx`, опрашивает счётчик
 * непрочитанных отдельно от этой функции.
 */
export async function appendGuestMessage(telegramId: string, body: string): Promise<boolean> {
  const thread = await db.supportThread.findUnique({ where: { telegramId } });
  if (!thread) return false;

  await db.$transaction([
    db.supportMessage.create({ data: { threadId: thread.id, direction: "IN", body } }),
    db.supportThread.update({
      where: { id: thread.id },
      data: { status: "OPEN", lastMessageAt: new Date() },
    }),
  ]);

  return true;
}

/** Лимит Telegram на длину подписи инлайн-кнопки. */
const FAQ_BUTTON_MAX_LEN = 64;

/**
 * Инлайн-клавиатура с частыми вопросами — прикрепляется к каждому сообщению
 * бота в чате поддержки (открытие диалога, ответ админа, автоответ на сам
 * FAQ), чтобы гость мог тапнуть вопрос в любой момент. `undefined`, если
 * список пуст — тогда сообщение уходит вовсе без клавиатуры.
 */
export async function getFaqKeyboard(): Promise<
  { inline_keyboard: { text: string; callback_data: string }[][] } | undefined
> {
  const faqs = await db.supportFaq.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, question: true },
  });
  if (faqs.length === 0) return undefined;
  return {
    inline_keyboard: faqs.map((f) => [
      {
        text: f.question.length > FAQ_BUTTON_MAX_LEN ? `${f.question.slice(0, FAQ_BUTTON_MAX_LEN - 1)}…` : f.question,
        callback_data: `support:faq:${f.id}`,
      },
    ]),
  };
}
