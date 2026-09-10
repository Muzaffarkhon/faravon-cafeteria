"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export type FeedbackState = { ok?: boolean; error?: string };

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** Сотрудник отправляет обращение обратной связи (§3). Обрабатывает C&B. */
export async function submitFeedback(
  _prev: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const session = await requireSession();
  assertCan(session.roles, "application.select");
  if (!session.employee) return { error: "Доступно только сотрудникам." };

  const topic = s(formData.get("topic")) || null;
  const message = s(formData.get("message"));
  if (message.length < 5) return { error: "Опишите обращение подробнее (не короче 5 символов)." };
  if (message.length > 4000) return { error: "Слишком длинное сообщение (максимум 4000 символов)." };

  const rec = await db.feedback.create({
    data: { employeeId: session.employee.id, topic, message },
  });
  await audit({
    actorId: session.user.id,
    action: "FEEDBACK_SUBMITTED",
    entityType: "Feedback",
    entityId: rec.id,
    newValue: { topic },
  });

  revalidatePath("/feedback");
  return { ok: true };
}
