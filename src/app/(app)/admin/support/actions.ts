"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";
import { sendTelegram } from "@/lib/notification-delivery";
import { escHtml } from "@/lib/notification-format";

function revalidateAll(threadId: string) {
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${threadId}`);
}

/** Ответить гостю: уходит в Telegram и сохраняется в переписке. */
export async function replyToThread(threadId: string, body: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    const text = body.trim();
    if (!text) throw new Error("Введите текст ответа.");

    const thread = await db.supportThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new Error("Диалог не найден.");

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан — отправка недоступна.");

    // Экранируем: это обычный текст от человека, а не шаблон с разметкой —
    // случайные `<`/`&` не должны ломать HTML-сообщение в Telegram.
    const ok = await sendTelegram(token, thread.telegramId, escHtml(text));
    if (!ok) throw new Error("Не удалось отправить сообщение в Telegram.");

    await db.$transaction([
      db.supportMessage.create({
        data: { threadId, direction: "OUT", body: text, authorId: s.user.id },
      }),
      db.supportMessage.updateMany({
        where: { threadId, direction: "IN", readAt: null },
        data: { readAt: new Date() },
      }),
      db.supportThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
    ]);

    await audit({
      actorId: s.user.id,
      action: "SUPPORT_REPLY_SENT",
      entityType: "SupportThread",
      entityId: threadId,
    });

    revalidateAll(threadId);
  });
}

/** Закрыть диалог. Если гость напишет снова — переоткроется сам. */
export async function closeThread(threadId: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    await db.supportThread.update({ where: { id: threadId }, data: { status: "CLOSED" } });
    await audit({
      actorId: s.user.id,
      action: "SUPPORT_THREAD_CLOSED",
      entityType: "SupportThread",
      entityId: threadId,
    });

    revalidateAll(threadId);
  });
}

/** Отметить входящие сообщения прочитанными (вызывается при открытии диалога). */
export async function markThreadRead(threadId: string): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "support.manage");

  await db.supportMessage.updateMany({
    where: { threadId, direction: "IN", readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/admin/support");
}
