/**
 * Доставка накопленных уведомлений в Telegram (§5.10).
 * Общий модуль без server-only: используется и cron-роутом на Vercel
 * (src/app/api/cron/deliver-notifications), и long-polling ботом (bot/notifications.ts).
 * Принимает Prisma-клиент параметром, чтобы каждая сторона передавала свой.
 */
import type { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import { formatNotificationText, templateMapFromRows } from "./notification-format";
import { asLocale } from "./i18n/shared";
import { couponScanUrl } from "./coupon-link";
import { confirmKeyboard } from "./broadcast-confirm-keys";

const TG_API = "https://api.telegram.org";

const BATCH_SIZE = 25;
const BATCH_INTERVAL_MS = 1000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type TgResult = { ok: boolean; blocked: boolean };

async function tgResult(r: Response): Promise<TgResult> {
  const data = (await r.json().catch(() => null)) as
    | { ok?: boolean; error_code?: number; description?: string }
    | null;
  const ok = !!data?.ok;
  const blocked = !ok && data?.error_code === 403;
  return { ok, blocked };
}

/**
 * Текст уведомления — всегда HTML (жирный заголовок, `<code>` для номеров и
 * промокодов, см. DEFAULT_TEMPLATES). Значения, подставленные в шаблон
 * (formatNotificationText → renderTemplate), уже экранированы — сама разметка
 * шаблона (b/code) экранированию не подлежит, поэтому шлём как есть.
 */
export async function sendTelegram(
  token: string,
  chatId: string,
  html: string,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  return (await sendTelegramDetailed(token, chatId, html, extra)).ok;
}

export async function sendTelegramDetailed(
  token: string,
  chatId: string,
  html: string,
  extra: Record<string, unknown> = {},
): Promise<TgResult> {
  try {
    const r = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", ...extra }),
    });
    return await tgResult(r);
  } catch {
    return { ok: false, blocked: false };
  }
}

/** QR-картинка купона вместо текстового кода (§11), подпись — тот же HTML. */
async function sendTelegramQr(
  token: string,
  chatId: string,
  qrText: string,
  caption: string,
): Promise<TgResult> {
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
    form.append("parse_mode", "HTML");
    form.append(
      "photo",
      new Blob([new Uint8Array(png)], { type: "image/png" }),
      "coupon-qr.png",
    );
    const r = await fetch(`${TG_API}/bot${token}/sendPhoto`, { method: "POST", body: form });
    return await tgResult(r);
  } catch {
    return { ok: false, blocked: false };
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
  const { db, token, limit = 300, log } = opts;
  if (!token) {
    log?.("TELEGRAM_BOT_TOKEN не задан — доставка пропущена.");
    return { delivered: 0, failed: 0, skipped: 0 };
  }

  const templateRows = await db.notificationTemplate.findMany({
    select: { event: true, body: true, translations: true },
  });
  const templates = templateMapFromRows(templateRows);

  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  const pending = await db.notification.findMany({
    where: {
      deliveredAt: null,
      blockedAt: null,
      channel: "TELEGRAM",
      sentAt: { gt: new Date(Date.now() - STALE_MS) },
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
      user: { select: { telegramId: true, locale: true, employee: { select: { telegramId: true } } } },
    },
    orderBy: { sentAt: "asc" },
    take: limit,
  });

  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  const sendOne = async (n: (typeof pending)[number]) => {
    const tgId = n.user.telegramId ?? n.user.employee?.telegramId;
    if (!tgId) {
      skipped++;
      return;
    }
    const claim = await db.notification.updateMany({
      where: { id: n.id, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
    if (claim.count === 0) {
      skipped++;
      return;
    }
    const payload = n.payload as Record<string, unknown> | null;
    const locale = asLocale(n.user.locale) ?? "ru";
    const body = formatNotificationText(n.event, payload, templates, locale);

    let result: TgResult;
    if (n.event === "COUPON_ISSUED" && typeof payload?.number === "string" && payload.number) {
      const caption = formatNotificationText(n.event, { ...payload, number: undefined }, templates, locale);
      result = await sendTelegramQr(token, tgId, couponScanUrl(payload.number), caption);
    } else if (typeof payload?.confirmId === "string") {
      result = await sendTelegramDetailed(token, tgId, body, { reply_markup: confirmKeyboard(payload.confirmId, locale) });
    } else {
      result = await sendTelegramDetailed(token, tgId, body);
    }

    if (result.ok) {
      delivered++;
    } else if (result.blocked) {
      await db.notification.update({
        where: { id: n.id },
        data: { deliveredAt: null, blockedAt: new Date() },
      });
      failed++;
      log?.(`уведомление ${n.id}: бот заблокирован получателем`);
    } else {
      await db.notification.update({ where: { id: n.id }, data: { deliveredAt: null } });
      failed++;
      log?.(`не удалось отправить уведомление ${n.id}`);
    }
  };

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const paced = i + BATCH_SIZE < pending.length ? [sleep(BATCH_INTERVAL_MS)] : [];
    await Promise.all([...batch.map(sendOne), ...paced]);
  }

  if (delivered || failed) log?.(`доставлено ${delivered}, ошибок ${failed}`);
  return { delivered, failed, skipped };
}
