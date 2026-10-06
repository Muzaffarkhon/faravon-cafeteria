import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import {
  SUPPORT_PHOTO_CAPTION_MAX,
  SUPPORT_PHOTO_MAX_BYTES,
  SUPPORT_PHOTO_PER_DAY,
  sendPhotoToTelegram,
  sniffPhoto,
} from "@/lib/support-photo";

export const runtime = "nodejs";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Отправка фото в чат поддержки (multipart: threadId, file, caption?, replyToId?).
 * - Сотрудник — только в своё открытое обращение с сайта (WEB): файл → Vercel Blob.
 * - C&B — в любой диалог: на сайт — файл → Blob; в Telegram — прямо гостю через sendPhoto,
 *   у нас остаётся один file_id (файл живёт в боте и не занимает наше хранилище).
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Войдите в систему.", 401);
  const isStaff = can(session.roles, "support.manage");
  if (!isStaff && !session.employee) return fail("Доступно только сотрудникам.", 403);

  const form = await request.formData().catch(() => null);
  const threadId = String(form?.get("threadId") ?? "");
  const file = form?.get("file");
  const caption = String(form?.get("caption") ?? "").trim();
  const replyToId = String(form?.get("replyToId") ?? "") || undefined;
  if (!threadId || !(file instanceof File)) return fail("Не выбрано фото.");
  if (caption.length > SUPPORT_PHOTO_CAPTION_MAX) return fail(`Подпись длиннее ${SUPPORT_PHOTO_CAPTION_MAX} символов.`);
  if (file.size === 0 || file.size > SUPPORT_PHOTO_MAX_BYTES) return fail("Фото должно быть не больше 3 МБ.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffPhoto(bytes);
  if (!kind) return fail("Поддерживаются только фото JPG, PNG или WebP.");

  const thread = await db.supportThread.findUnique({ where: { id: threadId } });
  if (!thread) return fail("Диалог не найден.", 404);
  if (!isStaff) {
    if (thread.source !== "WEB" || thread.employeeId !== session.employee!.id) return fail("Обращение не найдено.", 404);
    if (thread.status === "CLOSED") return fail("Обращение закрыто — новых сообщений не принимает.");
    const today = await db.supportMessage.count({
      where: { threadId, direction: "IN", imageUrl: { not: null }, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    if (today >= SUPPORT_PHOTO_PER_DAY) return fail("Слишком много фото за сутки — попробуйте завтра.", 429);
  }
  const replyTarget = replyToId
    ? await db.supportMessage.findFirst({ where: { id: replyToId, threadId }, select: { id: true, tgMessageId: true } })
    : null;
  if (replyToId && !replyTarget) return fail("Сообщение для ответа не найдено.");

  const direction = isStaff ? "OUT" : "IN";
  let imageUrl: string | null = null;
  let tgFileId: string | null = null;
  let tgMessageId: number | null = null;

  if (thread.source === "TELEGRAM") {
    if (!thread.telegramId) return fail("У диалога нет Telegram-чата.");
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return fail("TELEGRAM_BOT_TOKEN не задан — отправка недоступна.", 503);
    const sent = await sendPhotoToTelegram(
      token,
      thread.telegramId,
      { bytes: bytes as Uint8Array<ArrayBuffer>, mime: kind.mime, name: `photo.${kind.ext}` },
      caption,
      replyTarget?.tgMessageId ?? undefined,
    );
    if ("error" in sent) return fail(sent.error, 502);
    tgFileId = sent.fileId;
    tgMessageId = sent.messageId;
  } else {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return fail("Хранилище изображений не настроено (нет BLOB_READ_WRITE_TOKEN).", 503);
    try {
      const blob = await put(`support/${threadId}/${crypto.randomUUID()}.${kind.ext}`, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: kind.mime }), {
        access: "public",
        contentType: kind.mime,
      });
      imageUrl = blob.url;
    } catch (e) {
      console.error("[support-photo] put failed", e);
      return fail("Не удалось сохранить фото. Попробуйте ещё раз.", 502);
    }
  }

  const message = await db.$transaction(async (tx) => {
    const m = await tx.supportMessage.create({
      data: {
        threadId,
        direction,
        body: caption,
        imageUrl,
        tgFileId,
        tgMessageId,
        authorId: isStaff ? session.user.id : undefined,
        replyToId,
      },
    });
    if (isStaff) {
      await tx.supportMessage.updateMany({ where: { threadId, direction: "IN", readAt: null }, data: { readAt: new Date() } });
      await tx.supportThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
    } else {
      await tx.supportThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
    }
    return m;
  });
  await audit({
    actorId: session.user.id,
    action: isStaff ? "SUPPORT_PHOTO_SENT" : "SUPPORT_PHOTO_RECEIVED",
    entityType: "SupportThread",
    entityId: threadId,
    newValue: { messageId: message.id },
  });
  return NextResponse.json({ ok: true, id: message.id });
}
