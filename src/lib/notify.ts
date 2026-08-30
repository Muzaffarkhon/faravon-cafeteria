import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Запись уведомления сотруднику, ТЗ v2 §5.10.
 * Канал по умолчанию — Telegram; фактическая доставка появится вместе с ботом.
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

export const NOTIFICATION_LABELS: Record<string, string> = {
  ITEM_APPROVED: "Позиция заявки одобрена",
  ITEM_REJECTED: "Позиция заявки отклонена",
  COUPON_CREATED: "Купон сформирован",
  COUPON_ISSUED: "Купон выдан",
};
