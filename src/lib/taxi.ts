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

export type PromoStatus = "NONE" | "DELIVERED" | "BLOCKED" | "PENDING";

function promoStatusOf(n?: { deliveredAt: Date | null; blockedAt: Date | null }): PromoStatus {
  if (!n) return "NONE";
  if (n.blockedAt) return "BLOCKED";
  if (n.deliveredAt) return "DELIVERED";
  return "PENDING";
}

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
  /** Статус последней рассылки промокода по этой позиции (если была). */
  promoStatus: PromoStatus;
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

  // Статус промокода считаем по конкретной позиции (itemId), а не по всей
  // истории сотрудника — иначе новое одобрение в новом периоде наследует
  // «доставлено» от промокода, отправленного в прошлом периоде.
  const employeeIds = [...new Set(items.map((i) => i.application.employee.id))];
  const users = employeeIds.length
    ? await db.user.findMany({
        where: { employeeId: { in: employeeIds } },
        select: { employeeId: true, id: true },
      })
    : [];
  const userIds = users.map((u) => u.id);
  const notifications = userIds.length
    ? await db.notification.findMany({
        where: { userId: { in: userIds }, event: "TAXI_PROMO_CODE" },
        orderBy: { sentAt: "desc" },
        select: { payload: true, deliveredAt: true, blockedAt: true },
      })
    : [];
  const latestByItem = new Map<string, (typeof notifications)[number]>();
  for (const n of notifications) {
    const itemId = (n.payload as { itemId?: string } | null)?.itemId;
    if (itemId && !latestByItem.has(itemId)) latestByItem.set(itemId, n);
  }

  return items.map((i) => {
    const custom = (i.contactPhone ?? "").trim();
    const profile = (i.application.employee.phone ?? "").trim();
    const promoStatus = promoStatusOf(latestByItem.get(i.id));
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
 * Статус рассылки промокода такси по конкретным позициям (itemId) для
 * одного сотрудника — чтобы показать на его собственной странице заявок,
 * что происходит с одобренной поездкой (а не просто статичный бейдж
 * «Одобрено», неотличимый от QR-льготы, купон по которой ещё не выдан).
 */
export async function taxiPromoStatusForUser(
  userId: string,
  itemIds: string[],
): Promise<Map<string, PromoStatus>> {
  if (itemIds.length === 0) return new Map();
  const notifications = await db.notification.findMany({
    where: { userId, event: "TAXI_PROMO_CODE" },
    orderBy: { sentAt: "desc" },
    select: { payload: true, deliveredAt: true, blockedAt: true },
  });
  const latestByItem = new Map<string, (typeof notifications)[number]>();
  for (const n of notifications) {
    const itemId = (n.payload as { itemId?: string } | null)?.itemId;
    if (itemId && !latestByItem.has(itemId)) latestByItem.set(itemId, n);
  }
  return new Map(itemIds.map((id) => [id, promoStatusOf(latestByItem.get(id))]));
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
  // Промокод уже доставлен по этой позиции — не заваливаем сотрудника повторами.
  const pending = recipients.filter((r) => r.promoStatus !== "DELIVERED");
  const employeeIds = [...new Set(pending.map((r) => r.employeeId))];
  if (employeeIds.length === 0) throw new Error("Нет одобренных сотрудников для рассылки.");

  const users = await db.user.findMany({
    where: { isActive: true, employeeId: { in: employeeIds } },
    select: { id: true, employeeId: true },
  });
  const userIdByEmployee = new Map(users.map((u) => [u.employeeId, u.id]));

  const data = pending.flatMap((r) => {
    const userId = userIdByEmployee.get(r.employeeId);
    if (!userId) return [];
    return [
      {
        userId,
        event: "TAXI_PROMO_CODE",
        channel: "TELEGRAM",
        payload: { itemId: r.itemId, promo: code, card: r.card, period: r.period },
      },
    ];
  });
  if (data.length === 0) throw new Error("Нет одобренных сотрудников для рассылки.");

  await db.notification.createMany({ data });

  await audit({
    actorId: actorUserId,
    action: "TAXI_PROMO_BROADCAST",
    entityType: "Partner",
    entityId: partnerId,
    newValue: { recipients: data.length },
  });
  flushTelegram();
  return data.length;
}
