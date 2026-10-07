import { NextResponse, type NextRequest } from "next/server";
import { linkByPhone, reissueOtp, isKnownTelegramId, SafeLinkError, PhoneNotRecognizedError } from "@/lib/telegram-link";
import { resolveSelfRegistrationStep } from "@/lib/self-registration";
import { openOrReopenThread, appendGuestMessage, getFaqKeyboard } from "@/lib/support-chat";
import { formatTajikPhone, isTajikInternational } from "@/lib/phone";
import { grantMessage } from "@/lib/notification-format";
import { safeEqual } from "@/lib/timing-safe";
import { db } from "@/lib/db";
import { localeFromTelegram } from "@/lib/i18n/shared";
import { parseConfirmCallback } from "@/lib/broadcast-confirm-keys";
import { answerBroadcastConfirm } from "@/lib/broadcast-confirm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

async function tg(method: string, body: Record<string, unknown>) {
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function send(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

const WELCOME =
  "👋 Это бот доступа к платформе «Кафетерий льгот».\n\n" +
  "Чтобы получить логин и одноразовый пароль:\n" +
  "• нажмите «Поделиться контактом» ниже";

const UNSUPPORTED_CONTENT =
  "⚠️ Бот принимает только текстовые сообщения. Пожалуйста, воспользуйтесь кнопкой «Поделиться контактом» или напишите текстом.";

const SUPPORT_OPENED =
  "Опишите ваш вопрос — администратор увидит его и ответит здесь же, в этом чате.";

const ADMIN_BUTTON_LABEL = "🆘 Написать администратору";

const CONTACT_KEYBOARD = {
  reply_markup: {
    keyboard: [[{ text: "📱 Поделиться контактом", request_contact: true }], [{ text: ADMIN_BUTTON_LABEL }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

const SUPPORT_BUTTON = {
  reply_markup: {
    inline_keyboard: [[{ text: "Написать администратору", callback_data: "support:start" }]],
  },
};

// Уже привязанному Telegram (сотрудник/служебная учётка) не место повторно
// просить «Поделиться контактом» — этот номер система уже знает. Иначе
// человек, который просто написал боту что-то непонятное, получает тот же
// экран, что и незнакомец, впервые открывший бота.
const UNKNOWN_MESSAGE_KNOWN_USER =
  "Не поняли ваше сообщение.\n\n" +
  "• /login — получить новый одноразовый пароль для входа\n" +
  "• «Написать администратору» — если нужна помощь";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MAX_GUEST_PHOTO_BYTES = 5 * 1024 * 1024;

interface TgMessage {
  message_id?: number;
  reply_to_message?: { message_id: number };
  chat: { id: number };
  from?: { id: number; language_code?: string };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
  photo?: { file_id: string; file_size?: number }[];
  caption?: string;
  document?: unknown;
  video?: unknown;
  video_note?: unknown;
  audio?: unknown;
  voice?: unknown;
  sticker?: unknown;
  animation?: unknown;
  location?: unknown;
  venue?: unknown;
  poll?: unknown;
}

function hasDisallowedContent(msg: TgMessage, photoAllowed: boolean): boolean {
  return !!(
    (msg.photo && !photoAllowed) ||
    msg.document ||
    msg.video ||
    msg.video_note ||
    msg.audio ||
    msg.voice ||
    msg.sticker ||
    msg.animation ||
    msg.location ||
    msg.venue ||
    msg.poll
  );
}

interface TgCallbackQuery {
  id: string;
  from: { id: number };
  message?: { chat: { id: number }; message_id: number };
  data?: string;
}

async function openContactSupportThread(telegramId: string, rawPhone: string) {
  const phone = isTajikInternational(rawPhone) ? formatTajikPhone(rawPhone) : null;
  await openOrReopenThread(telegramId);
  if (phone) await db.supportThread.update({ where: { telegramId }, data: { phone } });
  await appendGuestMessage(telegramId, `[Поделился контактом] ${phone ?? rawPhone}`);
}

/** Запоминаем незнакомого человека, запустившего бота, — для рассылки «не зарегистрировался». Сбой не мешает ответу бота. */
async function noteGuest(telegramId: string, languageCode?: string) {
  try {
    if (await isKnownTelegramId(telegramId)) return;
    const locale = localeFromTelegram(languageCode);
    await db.telegramGuest.upsert({
      where: { telegramId },
      create: { telegramId, locale },
      update: { lastStartAt: new Date(), blockedAt: null, locale },
    });
  } catch (e) {
    console.error("[telegram] не удалось записать гостя:", e);
  }
}

/**
 * После того как appendGuestMessage залогировал реплику гостя в тред,
 * пробует продвинуть авторегистрацию (см. self-registration.ts). Для
 * обычной переписки поддержки (тред без phone — не наша ветка) ничего не
 * делает — resolveSelfRegistrationStep вернёт { kind: "none" }.
 */
async function handleSelfRegistrationReply(chatId: number, telegramId: string, text: string) {
  const action = await resolveSelfRegistrationStep(telegramId, text);
  switch (action.kind) {
    case "none":
      return;
    case "ambiguous":
      await send(
        chatId,
        "Нашли несколько похожих сотрудников. Уточните, пожалуйста, подразделение и должность — как в системе.",
        CONTACT_KEYBOARD,
      );
      return;
    case "ask_phone":
      await send(
        chatId,
        `Нашли вас: <b>${esc(action.fullName)}</b>.\n\n` +
          "Чтобы подтвердить личность, пришлите, пожалуйста, номер телефона, который сейчас записан за вами в системе.",
        CONTACT_KEYBOARD,
      );
      return;
    case "phone_wrong":
      await send(chatId, `Номер не подошёл. Осталось попыток: ${action.attemptsLeft}.`, CONTACT_KEYBOARD);
      return;
    case "phone_exhausted":
      await send(
        chatId,
        "Не получилось подтвердить номер. Напишите, пожалуйста, администратору — он поможет вручную.",
        CONTACT_KEYBOARD,
      );
      return;
    case "granted":
      await send(chatId, grantMessage(action.result.login, action.result.otp, action.result.fullName), {
        reply_markup: { remove_keyboard: true },
      });
      return;
  }
}

async function handle(msg: TgMessage) {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  if (!fromId) return;
  const telegramId = String(fromId);

  try {
    const photo = msg.photo?.at(-1);
    if (photo) {
      const hasThread = !!(await db.supportThread.findUnique({ where: { telegramId }, select: { id: true } }));
      if (hasThread && !hasDisallowedContent(msg, true) && (photo.file_size ?? 0) <= MAX_GUEST_PHOTO_BYTES) {
        await appendGuestMessage(telegramId, (msg.caption ?? "").trim().slice(0, 1000), {
          tgFileId: photo.file_id,
          tgMessageId: msg.message_id,
          replyToTgMessageId: msg.reply_to_message?.message_id,
        });
        return;
      }
    }
    if (hasDisallowedContent(msg, false)) {
      await send(chatId, UNSUPPORTED_CONTENT);
      return;
    }

    if (msg.contact) {
      if (msg.contact.user_id !== fromId) {
        await send(
          chatId,
          "Нажмите кнопку «📱 Поделиться контактом» — она передаёт ваш собственный номер. " +
            "Если номер не привязан к Telegram, обратитесь к администратору.",
        );
        return;
      }
      try {
        const g = await linkByPhone(msg.contact.phone_number, telegramId);
        await send(chatId, grantMessage(g.login, g.otp, g.fullName), { reply_markup: { remove_keyboard: true } });
      } catch (e) {
        if (!(e instanceof PhoneNotRecognizedError) || (await isKnownTelegramId(telegramId))) throw e;
        await openContactSupportThread(telegramId, msg.contact.phone_number);
        await send(
          chatId,
          "Не нашли вас по этому номеру в базе сотрудников.\n\n" +
            "Напишите, пожалуйста, здесь своё ФИО, должность и подразделение — как записано в системе. " +
            "Мы попробуем найти вашу карточку автоматически.",
          CONTACT_KEYBOARD,
        );
      }
      return;
    }

    const text = (msg.text || "").trim();

    if (text === "/start support" || text === ADMIN_BUTTON_LABEL) {
      await noteGuest(telegramId, msg.from?.language_code);
      await openOrReopenThread(telegramId);
      await send(chatId, SUPPORT_OPENED, { reply_markup: await getFaqKeyboard() });
      return;
    }
    if (text === "/start" || text === "/help") {
      await noteGuest(telegramId, msg.from?.language_code);
      await send(chatId, WELCOME, CONTACT_KEYBOARD);
      return;
    }
    if (text === "/id") {
      await send(
        chatId,
        `Ваш Telegram ID: <code>${telegramId}</code>\n` +
          "Передайте его администратору для привязки уведомлений к учётной записи.",
      );
      return;
    }
    if (text === "/login") {
      const g = await reissueOtp(telegramId);
      await send(chatId, grantMessage(g.login, g.otp, g.fullName));
      return;
    }

    if (text && !text.startsWith("/")) {
      const appended = await appendGuestMessage(telegramId, text, {
        tgMessageId: msg.message_id,
        replyToTgMessageId: msg.reply_to_message?.message_id,
      });
      if (appended) {
        await handleSelfRegistrationReply(chatId, telegramId, text);
        return;
      }
    }

    if (await isKnownTelegramId(telegramId)) {
      await send(chatId, UNKNOWN_MESSAGE_KNOWN_USER, SUPPORT_BUTTON);
      return;
    }

    await noteGuest(telegramId, msg.from?.language_code);
    await send(chatId, WELCOME, CONTACT_KEYBOARD);
  } catch (e) {
    if (e instanceof SafeLinkError) {
      const extra = /напишите администратору/i.test(e.message) ? SUPPORT_BUTTON : {};
      await send(chatId, `⚠️ ${e.message}`, extra);
    } else {
      console.error("[telegram] ошибка обработки update:", e);
      await send(chatId, "⚠️ Не удалось обработать запрос. Попробуйте позже или напишите администратору.", SUPPORT_BUTTON);
    }
  }
}

async function handleFaqTap(faqId: string, cb: TgCallbackQuery) {
  if (!cb.message) return;
  const faq = await db.supportFaq.findUnique({ where: { id: faqId } });
  if (!faq) return;

  const telegramId = String(cb.from.id);
  await openOrReopenThread(telegramId);
  await appendGuestMessage(telegramId, `[Вопрос] ${faq.question}`);

  const thread = await db.supportThread.findUnique({ where: { telegramId } });
  if (thread) {
    await db.$transaction([
      db.supportMessage.create({ data: { threadId: thread.id, direction: "OUT", body: faq.answer } }),
      db.supportThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } }),
    ]);
  }
  await tg("editMessageText", {
    chat_id: cb.message.chat.id,
    message_id: cb.message.message_id,
    text: esc(faq.answer),
    parse_mode: "HTML",
    reply_markup: await getFaqKeyboard(),
  });
}

async function handleCallback(cb: TgCallbackQuery) {
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  if (!cb.data || !cb.message) return;

  const confirm = parseConfirmCallback(cb.data);
  if (confirm) {
    const reply = await answerBroadcastConfirm({ ...confirm, telegramId: String(cb.from.id) });
    if (reply === null) return;
    await tg("editMessageReplyMarkup", {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
    await send(cb.message.chat.id, esc(reply));
    return;
  }

  if (cb.data.startsWith("support:faq:")) {
    await handleFaqTap(cb.data.slice("support:faq:".length), cb);
    return;
  }
  if (cb.data !== "support:start") return;

  const telegramId = String(cb.from.id);
  await openOrReopenThread(telegramId);
  await send(cb.message.chat.id, SUPPORT_OPENED, { reply_markup: await getFaqKeyboard() });
}

export async function POST(req: NextRequest) {
  if (!SECRET || !safeEqual(req.headers.get("x-telegram-bot-api-secret-token"), SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: { message?: TgMessage; callback_query?: TgCallbackQuery };
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (update.message) await handle(update.message);
  else if (update.callback_query) await handleCallback(update.callback_query);
  return NextResponse.json({ ok: true });
}
