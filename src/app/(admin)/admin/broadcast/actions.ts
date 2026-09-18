"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { flushTelegram } from "@/lib/notify";

export type BroadcastState = { sent?: number; error?: string };

/** Рассылка произвольного сообщения сотрудникам из админки (§5.10, BROADCAST). */
export async function sendBroadcast(
  _prev: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");

  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 2) return { error: "Введите текст сообщения." };
  if (text.length > 3500) return { error: "Текст слишком длинный (максимум 3500 символов)." };
  const department = String(formData.get("department") ?? "").trim();

  const employees = await db.employee.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      ...(department ? { department } : {}),
    },
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);
  if (employeeIds.length === 0) return { error: "Нет получателей по заданному фильтру." };

  const users = await db.user.findMany({
    where: { isActive: true, employeeId: { in: employeeIds } },
    select: { id: true },
  });
  if (users.length === 0) return { error: "Нет получателей по заданному фильтру." };

  await db.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      event: "BROADCAST",
      channel: "TELEGRAM",
      payload: { text },
    })),
  });

  await audit({
    actorId: session.user.id,
    action: "BROADCAST_SENT",
    entityType: "Notification",
    newValue: { recipients: users.length, department: department || "ALL", text },
  });
  flushTelegram();

  revalidatePath("/admin/broadcast");
  return { sent: users.length };
}
