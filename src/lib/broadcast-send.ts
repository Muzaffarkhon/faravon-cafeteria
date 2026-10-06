import "server-only";
import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { flushTelegram } from "@/lib/notify";
import { parseFilters, resolveAudience, type AudienceFilters } from "@/lib/broadcast-audience";
import { couponHintText } from "@/lib/broadcast-confirm-keys";
import { LOCALES, type Locale } from "@/lib/i18n/shared";
import { formatNotificationText, templateMapFromRows } from "@/lib/notification-format";
import { sendTelegramDetailed } from "@/lib/notification-delivery";
import { platformUrl } from "@/lib/platform-url";

/**
 * Отправка рассылки из админки. Одна функция и для «сейчас», и для отложенной:
 * аудитория собирается в момент отправки по сохранённым фильтрам, поэтому
 * отложенная рассылка достанется и тем, кто подключился после её создания.
 */

export type BroadcastTexts = Record<Locale, string>;

export const GUEST_MAX = 600;
const GUEST_BATCH = 25;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** id в формате cuid-подобной строки: callback_data кнопок «Да / Нет» принимает только [a-z0-9]. */
const newId = () => `b${randomBytes(12).toString("hex")}`;

export async function createCampaign(params: {
  actorId: string;
  title: string;
  filters: AudienceFilters;
  texts: BroadcastTexts;
  askConfirm: boolean;
  couponHint: boolean;
  scheduledAt: Date | null;
}) {
  const f = params.filters;
  return db.broadcastCampaign.create({
    data: {
      title: params.title,
      text: params.texts.ru,
      texts: params.texts,
      segment: f.segment,
      filters: f as unknown as Prisma.InputJsonValue,
      cardId: f.cardId || null,
      periodId: f.cardId ? f.periodId || null : null,
      cardAudience: f.cardId ? f.cardAudience : null,
      askConfirm: params.askConfirm,
      couponHint: params.couponHint,
      createdById: params.actorId,
      status: params.scheduledAt ? "SCHEDULED" : "SENDING",
      scheduledAt: params.scheduledAt,
    },
  });
}

export type ExecuteResult = { sent: number; failed: number; error?: string };

/**
 * Отправляет рассылку, если её ещё никто не отправляет: SCHEDULED/SENDING → SENT
 * атомарным переходом, чтобы крон и открытая админка не отправили её дважды.
 */
export async function executeCampaign(id: string, opts: { from: "SCHEDULED" | "SENDING" }): Promise<ExecuteResult> {
  if (opts.from === "SCHEDULED") {
    const claimed = await db.broadcastCampaign.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "SENDING" },
    });
    if (claimed.count === 0) return { sent: 0, failed: 0, error: "Рассылка уже отправлена или отменена." };
  }
  const c = await db.broadcastCampaign.findUniqueOrThrow({ where: { id } });
  const filters = parseFilters((c.filters ?? {}) as Record<string, string>);
  const texts = (c.texts ?? { ru: c.text, tg: "", uz: "" }) as BroadcastTexts;

  const siteUrl = platformUrl() || "";
  const textFor = (l: Locale) => {
    const base = texts[l] || texts.ru;
    return c.couponHint && siteUrl ? `${base}\n\n${couponHintText(l, siteUrl)}` : base;
  };

  const fail = async (error: string): Promise<ExecuteResult> => {
    await db.broadcastCampaign.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit({ actorId: c.createdById, action: "BROADCAST_FAILED", entityType: "BroadcastCampaign", entityId: id, newValue: { error } });
    return { sent: 0, failed: 0, error };
  };

  const audience = await resolveAudience(filters);
  if (audience.error) return fail(audience.error);
  if (audience.users.length + audience.guests.length === 0) return fail("Нет получателей по заданному фильтру.");

  let sent = 0;
  let failed = 0;

  if (audience.guests.length) {
    if (audience.guests.length > GUEST_MAX) {
      return fail(`Слишком много получателей за раз (${audience.guests.length}, максимум ${GUEST_MAX}).`);
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return fail("Не задан токен бота — отправка невозможна.");
    const rows = await db.notificationTemplate.findMany({ select: { event: true, body: true, translations: true } });
    const templates = templateMapFromRows(rows);
    const html = Object.fromEntries(
      LOCALES.map((l) => [l, formatNotificationText("BROADCAST", { text: textFor(l) }, templates, l)]),
    ) as Record<Locale, string>;

    const chats = audience.guests;
    for (let i = 0; i < chats.length; i += GUEST_BATCH) {
      const batch = chats.slice(i, i + GUEST_BATCH);
      const results = await Promise.all([
        ...batch.map(async (g) => ({ chatId: g.id, r: await sendTelegramDetailed(token, g.id, html[g.locale]) })),
        i + GUEST_BATCH < chats.length ? sleep(1000) : Promise.resolve(),
      ]);
      const blocked: string[] = [];
      for (const x of results) {
        if (!x || typeof x !== "object" || !("r" in x)) continue;
        if (x.r.ok) sent++;
        else {
          failed++;
          if (x.r.blocked) blocked.push(x.chatId);
        }
      }
      if (blocked.length) {
        await db.telegramGuest.updateMany({ where: { telegramId: { in: blocked } }, data: { blockedAt: new Date() } });
      }
    }
  } else {
    const rows = audience.users.map((u) => ({ user: u, rid: newId(), nid: newId() }));
    await db.$transaction([
      db.notification.createMany({
        data: rows.map(({ user, rid, nid }) => ({
          id: nid,
          userId: user.id,
          event: "BROADCAST",
          channel: "TELEGRAM",
          payload: { text: textFor(user.locale), ...(c.askConfirm ? { confirmId: rid } : {}) },
        })),
      }),
      db.broadcastRecipient.createMany({
        data: rows.map(({ user, rid, nid }) => ({ id: rid, campaignId: id, userId: user.id, notificationId: nid })),
      }),
    ]);
    sent = rows.length;
    flushTelegram();
  }

  await db.broadcastCampaign.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), guestSent: audience.guests.length ? sent : 0, guestFailed: failed },
  });
  await audit({
    actorId: c.createdById,
    action: "BROADCAST_SENT",
    entityType: "BroadcastCampaign",
    entityId: id,
    newValue: {
      recipients: audience.users.length + audience.guests.length,
      sent,
      failed,
      segment: filters.segment,
      filters,
      byLocale: audience.byLocale,
      texts,
      askConfirm: c.askConfirm,
      couponHint: c.couponHint,
      scheduled: opts.from === "SCHEDULED",
    },
  });
  return { sent, failed };
}

/** Отправить все отложенные рассылки, время которых пришло. Вызывают крон и страницы рассылок. */
export async function dispatchDueBroadcasts(log?: (m: string) => void): Promise<number> {
  const due = await db.broadcastCampaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, seq: true },
    take: 5,
  });
  for (const d of due) {
    try {
      const r = await executeCampaign(d.id, { from: "SCHEDULED" });
      log?.(`рассылка #${d.seq}: ${r.error ?? `отправлено ${r.sent}, ошибок ${r.failed}`}`);
    } catch (e) {
      console.error(`[broadcast] рассылка #${d.seq}:`, e);
    }
  }
  return due.length;
}
