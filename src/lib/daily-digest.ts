import "server-only";
import { db } from "@/lib/db";
import { taxiRecipientsForPartner } from "@/lib/taxi";

/**
 * Ежедневный отчёт по заявкам (§12): в начале рабочего дня C&B и подрядчики
 * получают в Telegram сводку, чтобы не забывать обрабатывать заявки.
 * Идемпотентно в рамках суток (Asia/Dushanbe): повторный запуск не дублирует.
 */

const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;

function startOfDushanbeToday(now = new Date()): Date {
  const local = new Date(now.getTime() + TZ_OFFSET_MS);
  const midnightLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  return new Date(midnightLocal - TZ_OFFSET_MS);
}

export async function runDailyDigest(now = new Date()): Promise<{ queued: number; skipped: number }> {
  const dayStart = startOfDushanbeToday(now);

  const [pendingReview, couponsToIssue, adRequests, newFeedback] = await Promise.all([
    db.applicationItem.count({ where: { status: "PENDING" } }),
    db.applicationItem.count({ where: { status: "APPROVED", coupon: null } }),
    db.advertisingRequest.count({ where: { status: "PENDING" } }),
    db.supportThread.count({ where: { messages: { some: { direction: "IN", readAt: null } } } }),
  ]);

  const cnbText =
    `На согласовании: ${pendingReview}\n` +
    `К выдаче купонов: ${couponsToIssue}\n` +
    `Заявок на рекламу: ${adRequests}\n` +
    `Новых обращений: ${newFeedback}`;

  const users = await db.user.findMany({
    where: { isActive: true, OR: [{ roles: { has: "C_AND_B" } }, { roles: { has: "CONTRACTOR" } }] },
    select: {
      id: true,
      roles: true,
      partnerId: true,
      partner: { select: { name: true, deliveryMode: true } },
    },
  });

  // Уже отправленные сегодня — пропускаем.
  const already = await db.notification.findMany({
    where: { event: "DAILY_DIGEST", sentAt: { gte: dayStart }, userId: { in: users.map((u) => u.id) } },
    select: { userId: true },
  });
  const sentToday = new Set(already.map((a) => a.userId));

  const taxiCache = new Map<string, number>();
  let queued = 0;
  let skipped = 0;

  for (const u of users) {
    if (sentToday.has(u.id)) {
      skipped++;
      continue;
    }

    let text: string;
    if (u.roles.includes("C_AND_B")) {
      text = cnbText;
    } else if (u.partnerId && u.partner?.deliveryMode === "PHONE_PROMO") {
      let waiting = taxiCache.get(u.partnerId);
      if (waiting == null) {
        waiting = (await taxiRecipientsForPartner(u.partnerId)).length;
        taxiCache.set(u.partnerId, waiting);
      }
      text = `Одобренных сотрудников ждут промокод: ${waiting}`;
    } else if (u.partnerId) {
      const toRedeem = await db.coupon.count({ where: { partnerId: u.partnerId, status: "ISSUED" } });
      text = `Купонов к активации на кассе: ${toRedeem}`;
    } else {
      skipped++;
      continue;
    }

    await db.notification.create({
      data: { userId: u.id, event: "DAILY_DIGEST", channel: "TELEGRAM", payload: { text } },
    });
    queued++;
  }

  return { queued, skipped };
}
