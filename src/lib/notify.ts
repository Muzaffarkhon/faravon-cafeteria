import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export { NOTIFICATION_LABELS, formatNotificationText } from "@/lib/notification-format";

/**
 * Запись уведомления сотруднику, ТЗ v2 §5.10.
 * Канал по умолчанию — Telegram; фактическую доставку выполняет bot/notifications.ts.
 */
export async function notifyEmployee(params: {
  employeeId: string;
  event: string;
  payload?: Prisma.InputJsonValue;
  channel?: string;
}) {
  const user = await db.user.findUnique({
    where: { employeeId: params.employeeId },
    select: { id: true },
  });
  if (!user) return;
  await db.notification.create({
    data: {
      userId: user.id,
      event: params.event,
      channel: params.channel ?? "TELEGRAM",
      payload: params.payload,
    },
  });
}

/**
 * Уведомление всем активным согласующим (роль APPROVER) — например,
 * о новой поданной заявке (§5.7). Пишется каждому согласующему отдельно,
 * бот доставит тем, у кого привязан Telegram.
 */
export async function notifyApprovers(params: {
  event: string;
  payload?: Prisma.InputJsonValue;
  channel?: string;
}) {
  const approvers = await db.user.findMany({
    where: { isActive: true, roles: { has: "APPROVER" } },
    select: { id: true },
  });
  if (approvers.length === 0) return;
  await db.notification.createMany({
    data: approvers.map((u) => ({
      userId: u.id,
      event: params.event,
      channel: params.channel ?? "TELEGRAM",
      payload: params.payload,
    })),
  });
}
