import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { flushTelegram } from "@/lib/notify";

/**
 * Поток «такси» (§4, §5, §11): у партнёра deliveryMode = PHONE_PROMO.
 * Наш QR не нужен — подрядчик работает по номеру телефона сотрудника и сам
 * рассылает промокоды. Купон в этом потоке не формируется: одобренная позиция
 * остаётся в статусе APPROVED, а подрядчик получает уведомление с номером.
 */

const ACTIVE_TAXI_STATUSES = ["APPROVED", "COUPON_CREATED", "COUPON_ISSUED"] as const;

export type TaxiRecipient = {
  itemId: string;
  employeeId: string;
  employee: string;
  department: string;
  phone: string;
  /** true — номер указан сотрудником при выборе (иначе — из профиля) */
  customPhone: boolean;
  card: string;
  period: string;
  approvedAt: Date | null;
  /** Статус последней рассылки промокода этому сотруднику (если была). */
  promoStatus: "NONE" | "DELIVERED" | "BLOCKED" | "PENDING";
};

/**
 * Одобренные позиции по PHONE_PROMO-льготам партнёра в незакрытых периодах.
 * `extraWhere` — доп. условия «умного фильтра» (см. components/smart-filter.tsx), AND'ятся с остальными.
 */
export async function taxiRecipientsForPartner(
  partnerId: string,
  extraWhere: Prisma.ApplicationItemWhereInput[] = [],
): Promise<TaxiRecipient[]> {
  const items = await db.applicationItem.findMany({
    where: {
      status: { in: [...ACTIVE_TAXI_STATUSES] },
      card: { is: { partnerId, partner: { is: { deliveryMode: "PHONE_PROMO" } } } },
      application: { is: { period: { is: { status: { not: "CLOSED" } } } } },
      ...(extraWhere.length ? { AND: extraWhere } : {}),
    },
    include: {
      card: { select: { title: true } },
      application: {
        include: {
          employee: { select: { id: true, fullName: true, department: true, phone: true } },
          period: { select: { name: true } },
        },
      },
    },
    orderBy: { decidedAt: "desc" },
  });

  // Последняя рассылка промокода на сотрудника — промокод активируется один раз
  // за период, поэтому важен статус самой свежей попытки, а не всей истории.
  const employeeIds = [...new Set(items.map((i) => i.application.employee.id))];
  const users = employeeIds.length
    ? await db.user.findMany({
        where: { employeeId: { in: employeeIds } },
        select: { employeeId: true, id: true },
      })
    : [];
  const userIdByEmployee = new Map(users.map((u) => [u.employeeId, u.id]));
  const userIds = users.map((u) => u.id);
  const notifications = userIds.length
    ? await db.notification.findMany({
        where: { userId: { in: userIds }, event: "TAXI_PROMO_CODE" },
        orderBy: { sentAt: "desc" },
        select: { userId: true, deliveredAt: true, blockedAt: true },
      })
    : [];
  const latestByUser = new Map<string, (typeof notifications)[number]>();
  for (const n of notifications) {
    if (!latestByUser.has(n.userId)) latestByUser.set(n.userId, n);
  }

  return items.map((i) => {
    const custom = (i.contactPhone ?? "").trim();
    const profile = (i.application.employee.phone ?? "").trim();
    const userId = userIdByEmployee.get(i.application.employee.id);
    const latest = userId ? latestByUser.get(userId) : undefined;
    const promoStatus: TaxiRecipient["promoStatus"] = !latest
      ? "NONE"
      : latest.blockedAt
        ? "BLOCKED"
        : latest.deliveredAt
          ? "DELIVERED"
          : "PENDING";
    return {
      itemId: i.id,
      employeeId: i.application.employee.id,
      employee: i.application.employee.fullName,
      department: i.application.employee.department,
      phone: custom || profile,
      customPhone: !!custom,
      card: i.card.title,
      period: i.application.period.name,
      approvedAt: i.decidedAt,
      promoStatus,
    };
  });
}

/**
 * Уведомление подрядчику такси об одобренной позиции (§4): приходит номер
 * телефона сотрудника, чтобы подрядчик завёл промокод в своей системе.
 */
export async function notifyTaxiContractorOnApprove(item: {
  id: string;
  contactPhone: string | null;
  card: { title: string; partnerId: string | null };
  application: { employee: { fullName: string; phone: string | null }; period: { name: string } };
}): Promise<void> {
  const partnerId = item.card.partnerId;
  if (!partnerId) return;
  const phone = (item.contactPhone ?? "").trim() || (item.application.employee.phone ?? "").trim();

  const contractors = await db.user.findMany({
    where: { isActive: true, roles: { has: "CONTRACTOR" }, partnerId },
    select: { id: true },
  });
  if (contractors.length === 0) return;

  await db.notification.createMany({
    data: contractors.map((u) => ({
      userId: u.id,
      event: "TAXI_REQUEST_APPROVED",
      channel: "TELEGRAM",
      payload: {
        employee: item.application.employee.fullName,
        phone,
        card: item.card.title,
        period: item.application.period.name,
      },
    })),
  });
  flushTelegram();
}

/**
 * Рассылка промокода (§11): подрядчик вводит промокод, все одобренные
 * получатели получают его моноширинным текстом в Telegram.
 * Возвращает количество адресатов.
 */
export async function broadcastTaxiPromo(
  partnerId: string,
  actorUserId: string,
  promo: string,
): Promise<number> {
  const code = promo.trim();
  if (code.length < 2) throw new Error("Введите промокод.");
  if (code.length > 200) throw new Error("Промокод слишком длинный.");

  const recipients = await taxiRecipientsForPartner(partnerId);
  const employeeIds = [...new Set(recipients.map((r) => r.employeeId))];
  if (employeeIds.length === 0) throw new Error("Нет одобренных сотрудников для рассылки.");

  const users = await db.user.findMany({
    where: { isActive: true, employeeId: { in: employeeIds } },
    select: { id: true, employeeId: true },
  });
  const cardByEmployee = new Map(recipients.map((r) => [r.employeeId, r.card]));
  const periodByEmployee = new Map(recipients.map((r) => [r.employeeId, r.period]));

  await db.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      event: "TAXI_PROMO_CODE",
      channel: "TELEGRAM",
      payload: {
        promo: code,
        card: cardByEmployee.get(u.employeeId ?? "") ?? "",
        period: periodByEmployee.get(u.employeeId ?? "") ?? "",
      },
    })),
  });

  await audit({
    actorId: actorUserId,
    action: "TAXI_PROMO_BROADCAST",
    entityType: "Partner",
    entityId: partnerId,
    newValue: { recipients: users.length },
  });
  flushTelegram();
  return users.length;
}
