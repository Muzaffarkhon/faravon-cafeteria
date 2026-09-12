"use server";

import { revalidatePath } from "next/cache";
import type { FeedbackStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";
import { FEEDBACK_NEXT_STATUSES, FEEDBACK_STATUS_LABEL } from "@/lib/feedback";

const VALID: FeedbackStatus[] = ["NEW", "READ", "NOTED", "CLOSED"];

/** C&B меняет статус обращения и, по желанию, оставляет ответ (§3). */
export async function setFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  note?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "feedback.manage");
    if (!VALID.includes(status)) throw new Error("Недопустимый статус.");

    const before = await db.feedback.findUnique({ where: { id } });
    if (!before) throw new Error("Обращение не найдено.");
    // Тот же список переходов, что рисует кнопки: клиент можно обойти.
    if (!FEEDBACK_NEXT_STATUSES[before.status].includes(status)) {
      throw new Error(
        before.status === "CLOSED"
          ? "Обращение закрыто — статус больше не меняется."
          : `Нельзя перевести из «${FEEDBACK_STATUS_LABEL[before.status]}» в «${FEEDBACK_STATUS_LABEL[status]}».`,
      );
    }

    const trimmedNote = (note ?? "").trim();
    await db.feedback.update({
      where: { id },
      data: {
        status,
        adminNote: trimmedNote ? trimmedNote.slice(0, 2000) : before.adminNote,
        handledById: s.user.id,
        handledAt: new Date(),
      },
    });
    await audit({
      actorId: s.user.id,
      action: "FEEDBACK_STATUS_CHANGED",
      entityType: "Feedback",
      entityId: id,
      oldValue: { status: before.status },
      newValue: { status },
    });
    revalidatePath("/admin/feedback");
    revalidatePath("/feedback");
  });
}
