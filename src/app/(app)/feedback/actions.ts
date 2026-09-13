"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { FEEDBACK_TOPICS } from "@/lib/feedback";

export type FeedbackState = { ok?: boolean; error?: string };

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** Сотрудник открывает новое обращение обратной связи (тред источника WEB). */
export async function submitFeedback(
  _prev: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const session = await requireSession();
  assertCan(session.roles, "application.select");
  if (!session.employee) return { error: "Доступно только сотрудникам." };

  const topic = s(formData.get("topic"));
  if (!FEEDBACK_TOPICS.includes(topic as (typeof FEEDBACK_TOPICS)[number])) {
    return { error: "Выберите тему обращения." };
  }
  const message = s(formData.get("message"));
  if (message.length < 5) return { error: "Опишите обращение подробнее (не короче 5 символов)." };
  if (message.length > 4000) return { error: "Слишком длинное сообщение (максимум 4000 символов)." };

  const thread = await db.supportThread.create({
    data: {
      source: "WEB",
      employeeId: session.employee.id,
      topic,
      messages: { create: { direction: "IN", body: message } },
    },
  });
  await audit({
    actorId: session.user.id,
    action: "FEEDBACK_SUBMITTED",
    entityType: "SupportThread",
    entityId: thread.id,
    newValue: { topic },
  });

  revalidatePath("/feedback");
  return { ok: true };
}

/** Сотрудник отвечает в уже открытом обращении — тот же тред, новое IN-сообщение. */
export async function replyInOwnThread(
  threadId: string,
  body: string,
): Promise<FeedbackState> {
  const session = await requireSession();
  assertCan(session.roles, "application.select");
  if (!session.employee) return { error: "Доступно только сотрудникам." };

  const text = body.trim();
  if (!text) return { error: "Введите сообщение." };
  if (text.length > 4000) return { error: "Слишком длинное сообщение (максимум 4000 символов)." };

  const thread = await db.supportThread.findUnique({ where: { id: threadId } });
  if (!thread || thread.source !== "WEB" || thread.employeeId !== session.employee.id) {
    return { error: "Обращение не найдено." };
  }
  if (thread.status === "CLOSED") return { error: "Обращение закрыто — новых сообщений не принимает." };

  await db.$transaction([
    db.supportMessage.create({ data: { threadId, direction: "IN", body: text } }),
    db.supportThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
  ]);

  revalidatePath("/feedback");
  return { ok: true };
}
