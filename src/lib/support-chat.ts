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
 * ранее был закрыт — тогда переоткрывает). Возвращает `null`, если треда
 * нет вовсе — тогда вызывающий код должен обработать сообщение как обычно
 * (например, показать WELCOME), а не как реплику в чате.
 *
 * `shouldNotify` — true, если это первое сообщение гостя подряд (не
 * дублируем уведомление C&B на каждую строчку, если гость пишет
 * абзацами): считается по тому, было ли предыдущее сообщение в треде от
 * C&B (OUT) или треда вообще не было сообщений.
 */
export async function appendGuestMessage(
  telegramId: string,
  body: string,
): Promise<{ shouldNotify: boolean; phone: string | null } | null> {
  const thread = await db.supportThread.findUnique({ where: { telegramId } });
  if (!thread) return null;

  const last = await db.supportMessage.findFirst({
    where: { threadId: thread.id },
    orderBy: { createdAt: "desc" },
  });
  const shouldNotify = !last || last.direction === "OUT";

  await db.$transaction([
    db.supportMessage.create({ data: { threadId: thread.id, direction: "IN", body } }),
    db.supportThread.update({
      where: { id: thread.id },
      data: { status: "OPEN", lastMessageAt: new Date() },
    }),
  ]);

  return { shouldNotify, phone: thread.phone };
}
