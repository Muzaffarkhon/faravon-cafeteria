/**
 * Telegram-бот авторизации (§5.1) — режим long polling для локальной разработки
 * и не-serverless хостинга. На Vercel вместо этого используется webhook-роут
 * `src/app/api/telegram/route.ts` (регистрация: `npm run webhook`).
 * Запуск: npm run bot   (нужен TELEGRAM_BOT_TOKEN в .env)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { linkByPhone, reissueOtp, SafeLinkError } from "./link";
import { startNotificationLoop } from "./notifications";

// --- минимальная загрузка .env (Prisma грузит свой, но токен бота — здесь) ---
try {
  for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* .env не обязателен */
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PLATFORM_URL = process.env.PLATFORM_URL || "http://localhost:3001";

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN не задан в .env — Telegram-бот не запущен.");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tg(method: string, body: Record<string, unknown>) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json() as Promise<{ ok: boolean; result?: unknown; description?: string }>;
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
    `Вход: ${PLATFORM_URL}/login`
  );
}

interface TgMessage {
  chat: { id: number };
  from?: { id: number };
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
      // Принимаем номер только если это подтверждённо собственный контакт
      // отправителя (иначе — захват аккаунта по чужому номеру из справочника).
      if (msg.contact.user_id !== fromId) {
        await send(
          chatId,
          "Нажмите кнопку «📱 Поделиться контактом» — она передаёт ваш собственный номер. " +
            "Если номер не привязан к Telegram, обратитесь к администратору.",
        );
        return;
      }
      const g = await linkByPhone(msg.contact.phone_number, telegramId);
      await send(chatId, grantMessage(g.login, g.otp, g.fullName), { reply_markup: { remove_keyboard: true } });
      return;
    }

    const text = (msg.text || "").trim();

    if (text === "/start" || text === "/help") {
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

    await send(chatId, WELCOME, CONTACT_KEYBOARD);
  } catch (e) {
    if (e instanceof SafeLinkError) {
      await send(chatId, `⚠️ ${e.message}`);
    } else {
      console.error("[bot] ошибка обработки сообщения:", e);
      await send(chatId, "⚠️ Не удалось обработать запрос. Попробуйте позже или напишите администратору.");
    }
  }
}

async function main() {
  const me = await tg("getMe", {});
  if (!me.ok) {
    console.error("Не удалось подключиться к Telegram API:", me.description);
    process.exit(1);
  }
  console.log(`Telegram-бот запущен: @${(me.result as { username?: string }).username}`);

  // Фоновая доставка уведомлений из таблицы Notification (§5.10)
  startNotificationLoop();

  let offset = 0;
  for (;;) {
    try {
      const res = await tg("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] });
      if (!res.ok) {
        console.error("getUpdates:", res.description);
        await sleep(3000);
        continue;
      }
      for (const upd of (res.result as { update_id: number; message?: TgMessage }[]) ?? []) {
        offset = upd.update_id + 1;
        if (upd.message) await handle(upd.message);
      }
    } catch (e) {
      console.error("Ошибка цикла опроса:", e);
      await sleep(3000);
    }
  }
}

main();
