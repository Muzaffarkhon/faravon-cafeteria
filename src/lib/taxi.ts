import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { flushTelegram } from "@/lib/notify";
import { normalizePhone } from "@/lib/phone";
import { parseSmartFilterParams, stringFilter, dateFilter, type SmartFilterField } from "@/lib/smart-filter";

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
  seq: number;
  employeeId: string;
  employee: string;
  department: string;
  phone: string;
  /** true — номер указан сотрудником при выборе (иначе — из профиля) */
  customPhone: boolean;
  card: string;
  period: string;
  approvedAt: Date | null;
  /** Промокод, отправленный сотруднику (если был). */
  promo: string | null;
  /** Статус последней рассылки промокода по этой позиции (если была). */
  promoStatus: PromoStatus;
};

/**
 * Последнее уведомление TAXI_PROMO_CODE по каждой позиции (itemId) среди
 * заданных сотрудников. Статус промокода считаем по конкретной позиции, а
 * не по всей истории сотрудника — иначе новое одобрение в новом периоде
 * наследует «доставлено» от промокода, отправленного в прошлом периоде.
 */
async function latestTaxiPromoByItem(employeeIds: string[]) {
  const users = employeeIds.length
    ? await db.user.findMany({
        where: { employeeId: { in: employeeIds } },
        select: { id: true },
      })
    : [];
  const userIds = users.map((u) => u.id);
  const notifications = userIds.length
    ? await db.notification.findMany({
        where: { userId: { in: userIds }, event: "TAXI_PROMO_CODE" },
        orderBy: { sentAt: "desc" },
        select: { payload: true, deliveredAt: true, blockedAt: true, sentAt: true },
      })
    : [];
  const latestByItem = new Map<string, (typeof notifications)[number]>();
  for (const n of notifications) {
    const itemId = (n.payload as { itemId?: string } | null)?.itemId;
    if (itemId && !latestByItem.has(itemId)) latestByItem.set(itemId, n);
  }
  return latestByItem;
}

/**
 * Одобренные позиции по PHONE_PROMO-льготам партнёра в незакрытых периодах.
 * `extraWhere` — доп. условия «умного фильтра» (см. components/smart-filter.tsx), AND'ятся с остальными.
 */
const TAXI_FILTER_FIELDS: SmartFilterField[] = [
  { key: "employee", label: "", type: "text" },
  { key: "department", label: "", type: "text" },
  { key: "phone", label: "", type: "text" },
  { key: "card", label: "", type: "text" },
  { key: "period", label: "", type: "text" },
  { key: "approvedAt", label: "", type: "date" },
];

/** Строит фильтр из query-параметров /provider/taxi — общее для самой страницы и
 *  её /provider/taxi/export, чтобы выгрузка всегда отражала то, что видно в таблице. */
export function buildTaxiSmartFilters(sp: Record<string, string | undefined>): Prisma.ApplicationItemWhereInput[] {
  const smartValues = parseSmartFilterParams(sp, TAXI_FILTER_FIELDS);
  const smartFilters: Prisma.ApplicationItemWhereInput[] = [];
  const employeeF = stringFilter(smartValues.employee);
  if (employeeF) smartFilters.push({ application: { is: { employee: { is: { fullName: employeeF } } } } });
  const departmentF = stringFilter(smartValues.department);
  if (departmentF) smartFilters.push({ application: { is: { employee: { is: { department: departmentF } } } } });
  const phoneF = stringFilter(smartValues.phone);
  if (phoneF) {
    smartFilters.push({
      OR: [{ contactPhone: phoneF }, { application: { is: { employee: { is: { phone: phoneF } } } } }],
    });
  }
  const cardF = stringFilter(smartValues.card);
  if (cardF) smartFilters.push({ card: { is: { title: cardF } } });
  const periodF = stringFilter(smartValues.period);
  if (periodF) smartFilters.push({ application: { is: { period: { is: { name: periodF } } } } });
  const approvedAtF = dateFilter(smartValues.approvedAt);
  if (approvedAtF) smartFilters.push({ decidedAt: approvedAtF });
  const q = (sp.q ?? "").trim();
  if (q) {
    smartFilters.push({
      OR: [
        { application: { is: { employee: { is: { fullName: { contains: q, mode: "insensitive" } } } } } },
        { application: { is: { employee: { is: { department: { contains: q, mode: "insensitive" } } } } } },
        { card: { is: { title: { contains: q, mode: "insensitive" } } } },
        { contactPhone: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  return smartFilters;
}

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

  const employeeIds = [...new Set(items.map((i) => i.application.employee.id))];
  const latestByItem = await latestTaxiPromoByItem(employeeIds);

  return items.map((i) => {
    const custom = (i.contactPhone ?? "").trim();
    const profile = (i.application.employee.phone ?? "").trim();
    const n = latestByItem.get(i.id);
    const promo = (n?.payload as { promo?: string } | null)?.promo ?? null;
    const promoStatus = promoStatusOf(n);
    return {
      itemId: i.id,
      seq: i.seq,
      employeeId: i.application.employee.id,
      employee: i.application.employee.fullName,
      department: i.application.employee.department,
      phone: custom || profile,
      customPhone: !!custom,
      card: i.card.title,
      period: i.application.period.name,
      approvedAt: i.decidedAt,
      promo,
      promoStatus,
    };
  });
}

export type TaxiRegistryRow = {
  itemId: string;
  seq: number;
  employee: string;
  cardTitle: string;
  partnerName: string | null;
  periodName: string;
  periodStatus: string;
  periodEndDate: Date;
  decidedAt: Date | null;
  promo: string | null;
  promoStatus: PromoStatus;
};

/**
 * Позиции по PHONE_PROMO-льготам (такси) для общего реестра купонов
 * C&B (`/coupons`) — для них не формируется Coupon (§ coupon-flow.ts:
 * «купон/QR не формируются», подрядчик рассылает промокод сам), поэтому
 * без этой функции они нигде не были видны C&B-админу, хотя фактически
 * являются выданной сотруднику льготой.
 */
export async function taxiRegistryRows(filters: {
  periodId?: string;
  partnerId?: string;
  employeeQuery?: string;
}): Promise<TaxiRegistryRow[]> {
  const items = await db.applicationItem.findMany({
    where: {
      status: { in: [...ACTIVE_TAXI_STATUSES] },
      card: {
        is: {
          partner: { is: { deliveryMode: "PHONE_PROMO" } },
          ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
        },
      },
      application: {
        is: {
          ...(filters.periodId ? { periodId: filters.periodId } : {}),
          ...(filters.employeeQuery
            ? { employee: { is: { fullName: { contains: filters.employeeQuery, mode: "insensitive" } } } }
            : {}),
        },
      },
    },
    include: {
      card: { select: { title: true, partner: { select: { name: true } } } },
      application: {
        include: {
          employee: { select: { id: true, fullName: true } },
          period: { select: { name: true, status: true, endDate: true } },
        },
      },
    },
    orderBy: { decidedAt: "desc" },
  });

  const employeeIds = [...new Set(items.map((i) => i.application.employee.id))];
  const latestByItem = await latestTaxiPromoByItem(employeeIds);

  return items.map((i) => {
    const n = latestByItem.get(i.id);
    return {
      itemId: i.id,
      seq: i.seq,
      employee: i.application.employee.fullName,
      cardTitle: i.card.title,
      partnerName: i.card.partner?.name ?? null,
      periodName: i.application.period.name,
      periodStatus: i.application.period.status,
      periodEndDate: i.application.period.endDate,
      decidedAt: i.decidedAt,
      promo: (n?.payload as { promo?: string } | null)?.promo ?? null,
      promoStatus: promoStatusOf(n),
    };
  });
}

/**
 * Активные промокоды такси сотрудника для диалога поддержки: позиции по PHONE_PROMO-льготам
 * в периодах, которые ещё не закончились, по которым промокод уже заводился. В списке и недоставленные
 * (бот заблокирован / сообщение не дошло) — сотрудник мог написать в поддержку именно из-за этого,
 * и C&B может переотправить код или скопировать его в чат.
 */
export async function activeTaxiPromosOfEmployee(employeeId: string) {
  const items = await db.applicationItem.findMany({
    where: {
      status: { in: [...ACTIVE_TAXI_STATUSES] },
      card: { is: { partner: { is: { deliveryMode: "PHONE_PROMO" } } } },
      application: { is: { employeeId, period: { is: { endDate: { gte: new Date() } } } } },
    },
    select: {
      id: true,
      card: { select: { title: true, partner: { select: { name: true } } } },
      application: { select: { period: { select: { endDate: true } } } },
    },
    orderBy: { decidedAt: "desc" },
    take: 20,
  });
  const latestByItem = await latestTaxiPromoByItem([employeeId]);
  return items.flatMap((i) => {
    const n = latestByItem.get(i.id);
    const promo = (n?.payload as { promo?: string } | null)?.promo ?? null;
    if (!promo) return [];
    return [
      {
        id: i.id,
        code: promo,
        status: promoStatusOf(n),
        title: i.card.title,
        partner: i.card.partner?.name ?? null,
        validUntil: i.application.period.endDate,
      },
    ];
  });
}

/**
 * Переотправка уже заведённого промокода сотруднику (например, он разблокировал бота и написал в поддержку):
 * тот же код уходит новым уведомлением. Вызывается из чата поддержки (право support.manage).
 */
export async function resendTaxiPromo(actorUserId: string, itemId: string): Promise<void> {
  const item = await db.applicationItem.findFirst({
    where: { id: itemId, status: { in: [...ACTIVE_TAXI_STATUSES] }, card: { is: { partner: { is: { deliveryMode: "PHONE_PROMO" } } } } },
    include: {
      card: { select: { title: true } },
      application: { include: { employee: { include: { user: true } }, period: { select: { name: true } } } },
    },
  });
  if (!item) throw new Error("Позиция не найдена или недоступна.");
  const userId = item.application.employee.user?.id;
  if (!userId) throw new Error("У сотрудника нет активного аккаунта.");
  const latest = (await latestTaxiPromoByItem([item.application.employee.id])).get(item.id);
  const promo = (latest?.payload as { promo?: string } | null)?.promo;
  if (!promo) throw new Error("Промокод по этой позиции ещё не заводился.");

  await db.notification.create({
    data: {
      userId,
      event: "TAXI_PROMO_CODE",
      channel: "TELEGRAM",
      payload: { itemId: item.id, promo, card: item.card.title, period: item.application.period.name },
    },
  });
  await audit({
    actorId: actorUserId,
    action: "TAXI_PROMO_RESENT",
    entityType: "ApplicationItem",
    entityId: item.id,
    newValue: { promo },
  });
  flushTelegram();
}

export type TaxiPromoInfo = { status: PromoStatus; promo: string | null };

/**
 * Статус рассылки промокода такси по конкретным позициям (itemId) для
 * одного сотрудника — чтобы показать на его собственной странице заявок,
 * что происходит с одобренной поездкой (а не просто статичный бейдж
 * «Одобрено», неотличимый от QR-льготы, купон по которой ещё не выдан).
 * Возвращает и сам код — тот же, что уже пришёл этому сотруднику в Telegram.
 */
export async function taxiPromoStatusForUser(
  userId: string,
  itemIds: string[],
): Promise<Map<string, TaxiPromoInfo>> {
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
  return new Map(
    itemIds.map((id) => {
      const n = latestByItem.get(id);
      const promo = (n?.payload as { promo?: string } | null)?.promo ?? null;
      return [id, { status: promoStatusOf(n), promo }];
    }),
  );
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
  // По этой позиции уже есть уведомление, которое либо доставлено, либо ещё
  // только в очереди на доставку (PENDING) — во втором случае повторная
  // рассылка создала бы второе уведомление, и сотруднику ушли бы оба, как
  // только очередь разгребётся. Пересылаем только тем, у кого рассылки не
  // было (NONE) или она гарантированно не дойдёт (BLOCKED — бот заблокирован,
  // такое уведомление снято с очереди и само не повторится).
  const eligible = recipients.filter((r) => r.promoStatus === "NONE" || r.promoStatus === "BLOCKED");
  const employeeIds = [...new Set(eligible.map((r) => r.employeeId))];
  if (employeeIds.length === 0) throw new Error("Нет одобренных сотрудников для рассылки.");

  const users = await db.user.findMany({
    where: { isActive: true, employeeId: { in: employeeIds } },
    select: { id: true, employeeId: true },
  });
  const userIdByEmployee = new Map(users.map((u) => [u.employeeId, u.id]));

  const data = eligible.flatMap((r) => {
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

export type IndividualPromoEntry = {
  phone?: string;
  itemId?: string;
  promo: string;
};

/**
 * Рассылка индивидуальных промокодов из загруженного файла.
 * Сопоставляет записи по itemId или по нормализованному номеру телефона.
 */
export async function distributeIndividualTaxiPromos(
  partnerId: string,
  actorUserId: string,
  entries: IndividualPromoEntry[],
): Promise<{
  sent: number;
  matched: number;
  notFound: number;
  emptyCode: number;
}> {
  const recipients = await taxiRecipientsForPartner(partnerId);
  const byItemId = new Map<string, TaxiRecipient>();
  const byPhone = new Map<string, TaxiRecipient>();

  for (const r of recipients) {
    byItemId.set(r.itemId, r);
    const norm = normalizePhone(r.phone);
    if (norm) byPhone.set(norm, r);
  }

  const assigned = new Map<string, { recipient: TaxiRecipient; promo: string }>();
  let emptyCode = 0;
  let notFound = 0;

  for (const entry of entries) {
    const code = (entry.promo ?? "").trim();
    if (!code) {
      emptyCode++;
      continue;
    }

    let target: TaxiRecipient | undefined;
    if (entry.itemId && byItemId.has(entry.itemId)) {
      target = byItemId.get(entry.itemId);
    } else if (entry.phone) {
      const norm = normalizePhone(entry.phone);
      if (norm && byPhone.has(norm)) {
        target = byPhone.get(norm);
      }
    }

    if (!target) {
      notFound++;
      continue;
    }

    assigned.set(target.itemId, { recipient: target, promo: code });
  }

  if (assigned.size === 0) {
    return { sent: 0, matched: 0, notFound, emptyCode };
  }

  const employeeIds = [...new Set(Array.from(assigned.values()).map((a) => a.recipient.employeeId))];
  const users = await db.user.findMany({
    where: { isActive: true, employeeId: { in: employeeIds } },
    select: { id: true, employeeId: true },
  });
  const userIdByEmployee = new Map(users.map((u) => [u.employeeId, u.id]));

  const notificationsData = Array.from(assigned.values()).flatMap(({ recipient: r, promo }) => {
    const userId = userIdByEmployee.get(r.employeeId);
    if (!userId) return [];
    return [
      {
        userId,
        event: "TAXI_PROMO_CODE",
        channel: "TELEGRAM",
        payload: { itemId: r.itemId, promo, card: r.card, period: r.period },
      },
    ];
  });

  if (notificationsData.length > 0) {
    await db.notification.createMany({ data: notificationsData });
    await audit({
      actorId: actorUserId,
      action: "TAXI_INDIVIDUAL_PROMOS_SENT",
      entityType: "Partner",
      entityId: partnerId,
      newValue: {
        sent: notificationsData.length,
        matched: assigned.size,
        notFound,
        emptyCode,
      },
    });
    flushTelegram();
  }

  return {
    sent: notificationsData.length,
    matched: assigned.size,
    notFound,
    emptyCode,
  };
}

/**
 * Точечная отправка промокода конкретному сотруднику по itemId.
 */
export async function sendSingleTaxiPromo(
  partnerId: string,
  actorUserId: string,
  itemId: string,
  promo: string,
): Promise<void> {
  const code = promo.trim();
  if (code.length < 2) throw new Error("Введите промокод.");
  if (code.length > 200) throw new Error("Промокод слишком длинный.");

  const item = await db.applicationItem.findFirst({
    where: {
      id: itemId,
      status: { in: [...ACTIVE_TAXI_STATUSES] },
      card: { is: { partnerId, partner: { is: { deliveryMode: "PHONE_PROMO" } } } },
    },
    include: {
      card: { select: { title: true } },
      application: {
        include: {
          employee: { include: { user: true } },
          period: { select: { name: true } },
        },
      },
    },
  });

  if (!item) throw new Error("Заявка не найдена или недоступна.");
  const userId = item.application.employee.user?.id;
  if (!userId) throw new Error("У сотрудника нет активного аккаунта.");

  await db.notification.create({
    data: {
      userId,
      event: "TAXI_PROMO_CODE",
      channel: "TELEGRAM",
      payload: { itemId: item.id, promo: code, card: item.card.title, period: item.application.period.name },
    },
  });

  await audit({
    actorId: actorUserId,
    action: "TAXI_PROMO_SENT_SINGLE",
    entityType: "ApplicationItem",
    entityId: item.id,
    newValue: { promo: code },
  });

  flushTelegram();
}

