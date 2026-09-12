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
