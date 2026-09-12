import { NextResponse, type NextRequest } from "next/server";
import { linkByPhone, linkByCode, reissueOtp, SafeLinkError } from "@/lib/telegram-link";
import { openOrReopenThread, appendGuestMessage } from "@/lib/support-chat";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const PLATFORM_URL = process.env.PLATFORM_URL || "";

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
  "• нажмите «Поделиться контактом» ниже, либо\n" +
  "• отправьте код от HR командой <code>/code ВАШКОД</code>\n\n" +
  "Уже привязаны? Команда <code>/login</code> выдаст новый одноразовый пароль.";

const SUPPORT_OPENED =
  "Опишите ваш вопрос — администратор увидит его и ответит здесь же, в этом чате.";

const CONTACT_KEYBOARD = {
  reply_markup: {
    keyboard: [[{ text: "📱 Поделиться контактом", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function grantMessage(login: string, otp: string, fullName: string) {
  return (
    `Здравствуйте, ${esc(fullName)}!\n\n` +
    `🔑 Логин: <code>${esc(login)}</code>\n` +
    `🔒 Одноразовый пароль: <code>${esc(otp)}</code>\n\n` +
    `Пароль действует 24 часа и на один вход. При первом входе задайте постоянный пароль.\n` +
    (PLATFORM_URL ? `Вход: ${PLATFORM_URL}/login` : "")
  );
}

interface TgMessage {
  chat: { id: number };
  from?: { id: number };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
}

interface TgCallbackQuery {
  id: string;
  from: { id: number };
  message?: { chat: { id: number } };
  data?: string;
}

async function handle(msg: TgMessage) {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  if (!fromId) return;
  const telegramId = String(fromId);

  try {
    if (msg.contact) {
      // Принимаем номер, ТОЛЬКО если это подтверждённо собственный контакт
      // отправителя (user_id совпадает с from.id). Отсутствие user_id = номер
      // не привязан к Telegram или скрыт приватностью — доверять ему нельзя
      // (иначе — захват аккаунта по чужому номеру из справочника).
      if (msg.contact.user_id !== fromId) {
        await send(
          chatId,
          "Нажмите кнопку «📱 Поделиться контактом» — она передаёт ваш собственный номер. " +
            "Если номер не привязан к Telegram, получите код у HR и отправьте <code>/code ВАШКОД</code>.",
        );
        return;
      }
      const g = await linkByPhone(msg.contact.phone_number, telegramId);
      await send(chatId, grantMessage(g.login, g.otp, g.fullName), { reply_markup: { remove_keyboard: true } });
      return;
    }

    const text = (msg.text || "").trim();

    // Deep-link со страницы входа (?start=support) — Telegram присылает его
    // как текст "/start support". Сразу открываем чат поддержки, не
    // заставляя человека ещё и нажимать кнопку внутри переписки.
    if (text === "/start support") {
      await openOrReopenThread(telegramId);
      await send(chatId, SUPPORT_OPENED);
      return;
    }
    if (text === "/start" || text === "/help") {
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
    if (text.startsWith("/code")) {
      const code = text.replace(/^\/code@?\S*/, "").trim();
      if (!code) {
        await send(chatId, "Укажите код: <code>/code ВАШКОД</code>");
        return;
      }
      const g = await linkByCode(code, telegramId);
      await send(chatId, grantMessage(g.login, g.otp, g.fullName));
      return;
    }
    if (text === "/login") {
      const g = await reissueOtp(telegramId);
      await send(chatId, grantMessage(g.login, g.otp, g.fullName));
      return;
    }

    // Обычное сообщение (не команда) — если для этого чата уже открыт
    // (или раньше был) тред поддержки, это реплика в чат, а не непонятый
    // ввод. Команды (/code, /login и т.п.) до этой точки не доходят —
    // они обработаны выше и возвращаются раньше.
    // C&B узнаёт о новом сообщении не через Telegram-пуш (это заваливало бы
    // их же бота на каждую реплику гостя), а через звук и мигание заголовка
    // прямо в интерфейсе — см. _support-alert.tsx.
    if (text && !text.startsWith("/")) {
      const appended = await appendGuestMessage(telegramId, text);
      if (appended) return;
    }

    await send(chatId, WELCOME, CONTACT_KEYBOARD);
  } catch (e) {
    // Наружу — только заранее одобренный текст. Всё прочее (Prisma, сеть)
    // логируем, пользователю — общая фраза (не оракул для перебора).
    if (e instanceof SafeLinkError) {
      // Любое сообщение об ошибке, которое отправляет человека «в HR» —
      // это и есть тупик, который решает чат поддержки. Правило по
      // подстроке, а не по списку сообщений: новая ошибка с той же фразой
      // получит кнопку сама, без правки этого места.
      const extra = /обратитесь в HR/i.test(e.message)
        ? {
            reply_markup: {
              inline_keyboard: [[{ text: "Написать администратору", callback_data: "support:start" }]],
            },
          }
        : {};
      await send(chatId, `⚠️ ${e.message}`, extra);
    } else {
      console.error("[telegram] ошибка обработки update:", e);
      await send(chatId, "⚠️ Не удалось обработать запрос. Попробуйте позже или обратитесь в HR.");
    }
  }
}

async function handleCallback(cb: TgCallbackQuery) {
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  if (cb.data !== "support:start" || !cb.message) return;

  const telegramId = String(cb.from.id);
  await openOrReopenThread(telegramId);
  await send(cb.message.chat.id, SUPPORT_OPENED);
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
