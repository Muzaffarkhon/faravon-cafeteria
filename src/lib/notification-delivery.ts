/**
 * Доставка накопленных уведомлений в Telegram (§5.10).
 * Общий модуль без server-only: используется и cron-роутом на Vercel
 * (src/app/api/cron/deliver-notifications), и long-polling ботом (bot/notifications.ts).
 * Принимает Prisma-клиент параметром, чтобы каждая сторона передавала свой.
 */
import type { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import { formatNotificationText } from "./notification-format";

const TG_API = "https://api.telegram.org";

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function tgOk(r: Response): Promise<boolean> {
  const data = (await r.json().catch(() => null)) as { ok?: boolean } | null;
  return !!data?.ok;
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    // Без parse_mode: тексты уведомлений — обычный текст из шаблонов
    // (NotificationTemplate) с подстановкой названий карточек и комментариев.
    // При parse_mode:"HTML" любой «<», «&» или «>» в этих данных (напр. карточка
    // «Спорт & фитнес» или причина отказа «бюджет < 5000») приводил к ответу
    // Telegram { ok:false } → уведомление зависало в бесконечном ретрае и
    // сотрудник его не получал никогда.
    const r = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return await tgOk(r);
  } catch {
    return false;
  }
}

/** Сообщение с моноширинным блоком (§11: промокод, который удобно копировать). */
async function sendTelegramHtml(token: string, chatId: string, html: string): Promise<boolean> {
  try {
    const r = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML" }),
    });
    return await tgOk(r);
  } catch {
    return false;
  }
}

/** QR-картинка купона вместо текстового кода (§11). */
async function sendTelegramQr(
  token: string,
  chatId: string,
  qrText: string,
  caption: string,
): Promise<boolean> {
  try {
    const png = await QRCode.toBuffer(qrText, {
      type: "png",
      errorCorrectionLevel: "M",
      width: 512,
      margin: 2,
    });
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append(
      "photo",
      new Blob([new Uint8Array(png)], { type: "image/png" }),
      "coupon-qr.png",
    );
    const r = await fetch(`${TG_API}/bot${token}/sendPhoto`, { method: "POST", body: form });
    return await tgOk(r);
  } catch {
    return false;
  }
}

export type DeliveryResult = { delivered: number; failed: number; skipped: number };

/**
 * Отправляет непоставленные Telegram-уведомления адресатам с привязанным Telegram
 * и проставляет deliveredAt. Возвращает статистику.
 */
export async function deliverTelegramNotifications(opts: {
  db: PrismaClient;
  token: string | undefined;
  limit?: number;
  log?: (msg: string) => void;
}): Promise<DeliveryResult> {
  const { db, token, limit = 25, log } = opts;
  if (!token) {
    log?.("TELEGRAM_BOT_TOKEN не задан — доставка пропущена.");
    return { delivered: 0, failed: 0, skipped: 0 };
  }

  const templateRows = await db.notificationTemplate.findMany({
    select: { event: true, body: true },
  });
  const templates = new Map(templateRows.map((t) => [t.event, t.body]));

  // Не пытаемся вечно: уведомления старше 7 дней (бот заблокирован, чат удалён,
  // «отравленное» сообщение) больше не выбираем — иначе они забивают очередь.
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  const pending = await db.notification.findMany({
    where: {
      deliveredAt: null,
      channel: "TELEGRAM",
      sentAt: { gt: new Date(Date.now() - STALE_MS) },
      // Адресат в Telegram: сотрудник с привязкой ЛИБО учётка без Employee
      // (подрядчик, C&B) с собственным User.telegramId (§11/§12).
      user: {
        is: {
          OR: [
            { employee: { is: { telegramId: { not: null } } } },
            { telegramId: { not: null } },
          ],
        },
      },
    },
    select: {
      id: true,
      event: true,
      payload: true,
      user: { select: { telegramId: true, employee: { select: { telegramId: true } } } },
    },
    orderBy: { sentAt: "asc" },
    take: limit,
  });

  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of pending) {
    const tgId = n.user.telegramId ?? n.user.employee?.telegramId;
    if (!tgId) {
      skipped++;
      continue;
    }
    // Атомарно «забираем» уведомление: помечаем deliveredAt ещё до отправки.
    // Параллельные воркеры (несколько after()-флашей, cron, бот) на это же уведомление
    // получат count=0 и не отправят его повторно — иначе при массовом согласовании
    // одно уведомление уходило по несколько раз.
    const claim = await db.notification.updateMany({
      where: { id: n.id, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
    if (claim.count === 0) {
      skipped++;
      continue;
    }
    const payload = n.payload as Record<string, unknown> | null;
    const body = formatNotificationText(n.event, payload, templates);

    let ok: boolean;
    if (n.event === "COUPON_ISSUED" && typeof payload?.number === "string" && payload.number) {
      // §11: вместо текстового кода — QR-картинка купона с подписью.
      ok = await sendTelegramQr(token, tgId, payload.number, "🔔 " + body);
    } else if (n.event === "TAXI_PROMO_CODE" && typeof payload?.promo === "string" && payload.promo) {
      // §11: промокод моноширинным блоком, чтобы удобно копировать.
      const promo = payload.promo;
      let html = "🔔 " + escHtml(body);
      html = html.split(escHtml(promo)).join(`<code>${escHtml(promo)}</code>`);
      ok = await sendTelegramHtml(token, tgId, html);
    } else {
      ok = await sendTelegram(token, tgId, "🔔 " + body);
    }

    if (ok) {
      delivered++;
    } else {
      // не ушло — возвращаем в очередь, повторит cron/бот
      await db.notification.update({ where: { id: n.id }, data: { deliveredAt: null } });
      failed++;
      log?.(`не удалось отправить уведомление ${n.id}`);
    }
  }

  if (delivered || failed) log?.(`доставлено ${delivered}, ошибок ${failed}`);
  return { delivered, failed, skipped };
}
