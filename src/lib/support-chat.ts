import "server-only";
import { db } from "@/lib/db";
import { sendTelegram } from "@/lib/notification-delivery";

/**
 * Уведомление C&B в Telegram о том, что диалог поддержки требует внимания —
 * ТОЛЬКО для двух случаев: совсем новый диалог и диалог, который был закрыт
 * и его переоткрыли. Обычные реплики в уже открытый диалог по-прежнему не
 * шлют Telegram-пуш (заваливало бы бота на каждое сообщение) — админ видит
 * их звуком и миганием заголовка вкладки, см. `_support-alert.tsx`.
 */
export async function notifySupportAdmins(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const admins = await db.user.findMany({
    where: { isActive: true, roles: { has: "C_AND_B" }, telegramId: { not: null } },
    select: { telegramId: true },
  });
  await Promise.all(admins.map((a) => sendTelegram(token, a.telegramId!, text)));
}

const NEW_THREAD_TEXT =
  "🆕 <b>Новое обращение в поддержку</b>\nОткройте раздел «Обращения», чтобы ответить.";
const REOPENED_THREAD_TEXT =
  "🔔 <b>Диалог поддержки снова открыт</b>\nГость написал в ранее закрытый чат.";

/**
 * Заводит или переоткрывает тред поддержки для этого Telegram-чата.
 * Вызывается по нажатию кнопки «Написать администратору» — до первого
 * реального сообщения гостя.
 */
export async function openOrReopenThread(telegramId: string): Promise<void> {
  const existing = await db.supportThread.findUnique({ where: { telegramId }, select: { status: true } });
  await db.supportThread.upsert({
    where: { telegramId },
    create: { telegramId, status: "OPEN" },
    update: { status: "OPEN" },
  });
  if (!existing) await notifySupportAdmins(NEW_THREAD_TEXT);
  else if (existing.status === "CLOSED") await notifySupportAdmins(REOPENED_THREAD_TEXT);
}

/**
 * Сохраняет сообщение гостя в его тред, если тред существует (открыт или
 * ранее был закрыт — тогда переоткрывает). Возвращает `false`, если треда
 * нет вовсе — тогда вызывающий код должен обработать сообщение как обычно
 * (например, показать WELCOME), а не как реплику в чате.
 * `tgFileId` — фото гостя: храним только file_id, сам файл остаётся в Telegram.
 */
export async function appendGuestMessage(
  telegramId: string,
  body: string,
  opts: { tgFileId?: string; tgMessageId?: number; replyToTgMessageId?: number } = {},
): Promise<boolean> {
  const thread = await db.supportThread.findUnique({ where: { telegramId } });
  if (!thread) return false;
  const wasClosed = thread.status === "CLOSED";
  // Гость ответил на конкретное сообщение (reply в Telegram) — привязываем к нему, как цитату в админке.
  const replyTo = opts.replyToTgMessageId
    ? await db.supportMessage.findFirst({ where: { threadId: thread.id, tgMessageId: opts.replyToTgMessageId }, select: { id: true } })
    : null;

  await db.$transaction([
    db.supportMessage.create({
      data: { threadId: thread.id, direction: "IN", body, tgFileId: opts.tgFileId, tgMessageId: opts.tgMessageId, replyToId: replyTo?.id },
    }),
    db.supportThread.update({
      where: { id: thread.id },
      data: { status: "OPEN", lastMessageAt: new Date() },
    }),
  ]);

  if (wasClosed) await notifySupportAdmins(REOPENED_THREAD_TEXT);
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

/**
 * Отправка текста гостю в Telegram с возвратом message_id (он нужен для будущих ответов на это сообщение).
 * `replyToTgMessageId` — настоящий ответ-цитата Telegram на сообщение гостя/наше, а не строка с курсивом в тексте.
 */
export async function sendSupportTelegram(
  token: string,
  chatId: string,
  html: string,
  opts: { replyToTgMessageId?: number; replyMarkup?: unknown } = {},
): Promise<{ messageId: number } | { error: string }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        ...(opts.replyToTgMessageId
          ? { reply_parameters: { message_id: opts.replyToTgMessageId, allow_sending_without_reply: true } }
          : {}),
        ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
      }),
    });
    const json = (await r.json().catch(() => null)) as { ok?: boolean; description?: string; result?: { message_id?: number } } | null;
    const messageId = json?.result?.message_id;
    if (!r.ok || !json?.ok || messageId == null) return { error: json?.description ?? "Не удалось отправить сообщение в Telegram." };
    return { messageId };
  } catch {
    return { error: "Не удалось связаться с Telegram." };
  }
}
