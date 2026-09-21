import { NextResponse, type NextRequest } from "next/server";
import { linkByPhone, reissueOtp, SafeLinkError, PhoneNotRecognizedError } from "@/lib/telegram-link";
import { resolveSelfRegistrationStep } from "@/lib/self-registration";
import { openOrReopenThread, appendGuestMessage, getFaqKeyboard } from "@/lib/support-chat";
import { formatTajikPhone, isTajikInternational } from "@/lib/phone";
import { grantMessage } from "@/lib/notification-format";
import { safeEqual } from "@/lib/timing-safe";
import { db } from "@/lib/db";
import { localeFromTelegram } from "@/lib/i18n/shared";

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

// Вторая строка — «Написать администратору» — есть всегда, вместе с
// «Поделиться контактом»: обычная кнопка (не request_contact), по нажатию
// отправляет свой текст как сообщение (см. проверку text === ADMIN_BUTTON_LABEL
// ниже). Из-за one_time_keyboard клавиатура схлопывается после каждого
// ответа — поэтому её нужно прикладывать к каждому сообщению бота, где
// кнопка администратора должна быть под рукой (не только на /start).
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

interface TgMessage {
  chat: { id: number };
  from?: { id: number; language_code?: string };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
  photo?: unknown;
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

// Разрешены только текст и «Поделиться контактом» — любые файлы/медиа от
// пользователя отклоняются без обработки (снижает поверхность атаки через
// вложения). Не касается исходящих сообщений бота (например, QR-кода).
function hasDisallowedContent(msg: TgMessage): boolean {
  return !!(
    msg.photo ||
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
  // Номер другой страны не приводим к «+992…»: иначе C&B принял бы его за таджикский.
  const phone = isTajikInternational(rawPhone) ? formatTajikPhone(rawPhone) : null;
  await openOrReopenThread(telegramId);
  if (phone) await db.supportThread.update({ where: { telegramId }, data: { phone } });
  await appendGuestMessage(telegramId, `[Поделился контактом] ${phone ?? rawPhone}`);
}

/**
 * true, если этот Telegram уже привязан к действующему сотруднику или
 * служебной учётке. Такому человеку нельзя отвечать «мы вас не нашли,
 * напишите ФИО» — он уже опознан, просто прислал контактом номер, которого
 * нет в его карточке (не совпадает с записью, лишний номер и т.п.). Иначе
 * непризнанный номер уходит прямо в его уже опознанный тред и выглядит так,
 * будто систему сбросило до «неизвестный гость» (см. кейс Зокировой).
 */
async function isKnownTelegramId(telegramId: string): Promise<boolean> {
  const employee = await db.employee.findFirst({ where: { telegramId, archivedAt: null }, select: { id: true } });
  if (employee) return true;
  const serviceUser = await db.user.findFirst({ where: { telegramId, employeeId: null }, select: { id: true } });
  return !!serviceUser;
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
    if (hasDisallowedContent(msg)) {
      await send(chatId, UNSUPPORTED_CONTENT);
      return;
    }

    if (msg.contact) {
      // Принимаем номер, ТОЛЬКО если это подтверждённо собственный контакт
      // отправителя (user_id совпадает с from.id). Отсутствие user_id = номер
      // не привязан к Telegram или скрыт приватностью — доверять ему нельзя
      // (иначе — захват аккаунта по чужому номеру из справочника).
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
        // Номер подтверждён Telegram-контактом, но сотрудника с ним нет —
        // не бросаем человека с текстовой ошибкой: сразу открываем чат
        // поддержки и сохраняем ЭТОТ (проверенный) номер за тредом, чтобы
        // C&B искал по нему, а не по тому, что гость мог случайно
        // опечатать текстом. Остаётся попросить ФИО, чтобы найти карточку.
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

    // Deep-link со страницы входа (?start=support) — Telegram присылает его
    // как текст "/start support". Сразу открываем чат поддержки, не
    // заставляя человека ещё и нажимать кнопку внутри переписки.
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
      // Для учёток подрядчиков/C&B без Employee: этот ID вставляет администратор
      // в поле «Telegram ID» учётной записи, чтобы приходили уведомления (§11/§12).
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

    // Обычное сообщение (не команда) — если для этого чата уже открыт
    // (или раньше был) тред поддержки, это реплика в чат, а не непонятый
    // ввод. Команды (/login и т.п.) до этой точки не доходят —
    // они обработаны выше и возвращаются раньше.
    // C&B узнаёт о новом сообщении не через Telegram-пуш (это заваливало бы
    // их же бота на каждую реплику гостя), а через звук и мигание заголовка
    // прямо в интерфейсе — см. _support-alert.tsx.
    if (text && !text.startsWith("/")) {
      const appended = await appendGuestMessage(telegramId, text);
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
    // Наружу — только заранее одобренный текст. Всё прочее (Prisma, сеть)
    // логируем, пользователю — общая фраза (не оракул для перебора).
    if (e instanceof SafeLinkError) {
      // Любое сообщение об ошибке, которое отправляет человека к
      // администратору — это и есть тупик, который решает чат поддержки.
      // Правило по подстроке, а не по списку сообщений: новая ошибка с той
      // же фразой получит кнопку сама, без правки этого места.
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
  // Тап по вопросу — как и обычное сообщение, открывает/переоткрывает диалог
  // и остаётся в истории для C&B, а не только у гостя.
  await openOrReopenThread(telegramId);
  await appendGuestMessage(telegramId, `[Вопрос] ${faq.question}`);

  const thread = await db.supportThread.findUnique({ where: { telegramId } });
  if (thread) {
    await db.$transaction([
      db.supportMessage.create({ data: { threadId: thread.id, direction: "OUT", body: faq.answer } }),
      db.supportThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } }),
    ]);
  }
  // Редактируем то же сообщение бота (с которого была нажата кнопка) вместо
  // отправки нового — иначе список вопросов дублируется под каждым ответом
  // и чат быстро зарастает одинаковыми клавиатурами.
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
