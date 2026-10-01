import "server-only";
import { Prisma, type BroadcastStatus } from "@prisma/client";
import { db } from "@/lib/db";

/** Доставка одному получателю — по связанному уведомлению (Notification). */
export type Delivery = "DELIVERED" | "PENDING" | "BLOCKED" | "FAILED" | "UNKNOWN";
export const DELIVERY_LABEL: Record<Delivery, string> = {
  DELIVERED: "Доставлено",
  PENDING: "В очереди",
  BLOCKED: "Заблокировал бота",
  FAILED: "Не доставлено",
  UNKNOWN: "—",
};
// Совпадает с STALE_MS в notification-delivery.ts: старше — доставка больше не пытается.
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

function deliveryOf(n: { deliveredAt: Date | null; blockedAt: Date | null; sentAt: Date } | null): Delivery {
  if (!n) return "UNKNOWN";
  if (n.blockedAt) return "BLOCKED";
  if (n.deliveredAt) return "DELIVERED";
  return Date.now() - n.sentAt.getTime() > STALE_MS ? "FAILED" : "PENDING";
}

// Служебные строки, которые бот сам пишет в чат поддержки («[Рассылка …] Ответ: Нет») — не причина.
const SYSTEM_LINE = /^\[[^\]]+\]/;
// Причиной считаем первое сообщение сотрудника в течение двух суток после ответа «Нет».
const REASON_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Получатели рассылки, их ответы, доставка и причина «Нет» — для страницы отчёта и выгрузки. */
export async function loadCampaignReport(id: string) {
  const campaign = await db.broadcastCampaign.findUnique({
    where: { id },
    include: {
      recipients: {
        include: {
          notification: { select: { deliveredAt: true, blockedAt: true, sentAt: true } },
          user: {
            select: {
              id: true,
              telegramId: true,
              employee: { select: { fullName: true, department: true, position: true, telegramId: true } },
            },
          },
        },
      },
    },
  });
  if (!campaign) return null;

  const tgOf = (r: (typeof campaign.recipients)[number]) => r.user.telegramId ?? r.user.employee?.telegramId ?? null;
  const tgIds = campaign.recipients.flatMap((r) => tgOf(r) ?? []);
  const threads = await db.supportThread.findMany({ where: { telegramId: { in: tgIds } }, select: { id: true, telegramId: true } });
  const threadByTg = new Map(threads.map((t) => [t.telegramId, t.id]));

  // Причина «Нет»: бот просит её сразу после ответа, сотрудник пишет в чат поддержки.
  const noThreadIds = campaign.recipients.flatMap((r) => (r.answer === "NO" ? (threadByTg.get(tgOf(r) ?? "") ?? []) : []));
  const messages = noThreadIds.length
    ? await db.supportMessage.findMany({
        where: { threadId: { in: noThreadIds }, direction: "IN", createdAt: { gte: campaign.createdAt } },
        select: { threadId: true, body: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const reasonFor = (threadId: string | null, answeredAt: Date | null) => {
    if (!threadId || !answeredAt) return null;
    const until = answeredAt.getTime() + REASON_WINDOW_MS;
    return (
      messages.find(
        (m) => m.threadId === threadId && m.createdAt >= answeredAt && m.createdAt.getTime() <= until && !SYSTEM_LINE.test(m.body),
      )?.body ?? null
    );
  };

  const order = { NO: 0, YES: 1 } as const;
  const rows = campaign.recipients
    .map((r) => {
      const threadId = threadByTg.get(tgOf(r) ?? "") ?? null;
      return {
        id: r.id,
        userId: r.user.id,
        hasTelegram: !!tgOf(r),
        fullName: r.user.employee?.fullName ?? "—",
        department: r.user.employee?.department ?? "",
        position: r.user.employee?.position ?? "",
        answer: r.answer,
        answeredAt: r.answeredAt,
        reason: r.answer === "NO" ? reasonFor(threadId, r.answeredAt) : null,
        delivery: deliveryOf(r.notification),
        threadId,
      };
    })
    // «Нет» сверху — с ними нужно работать; дальше «Да», в конце не ответившие.
    .sort((a, b) => (a.answer ? order[a.answer] : 2) - (b.answer ? order[b.answer] : 2) || a.fullName.localeCompare(b.fullName, "ru"));

  return { campaign, rows };
}

export const ANSWER_LABEL = { YES: "Да", NO: "Нет" } as const;

export type CampaignSummary = {
  id: string;
  seq: number;
  title: string;
  createdAt: Date;
  sentAt: Date | null;
  scheduledAt: Date | null;
  status: BroadcastStatus;
  segment: string | null;
  askConfirm: boolean;
  author: string;
  /** Сотрудники (строки получателей) + «гости», которым ушло напрямую. */
  total: number;
  yes: number;
  no: number;
  none: number;
  delivered: number;
  blocked: number;
  guestSent: number;
  guestFailed: number;
};

/** Последние рассылки и счётчики ответов/доставки — одним запросом, без загрузки всех получателей. */
export async function loadCampaignList(take = 100): Promise<CampaignSummary[]> {
  const campaigns = await db.broadcastCampaign.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      seq: true,
      title: true,
      createdAt: true,
      sentAt: true,
      scheduledAt: true,
      status: true,
      segment: true,
      askConfirm: true,
      createdById: true,
      guestSent: true,
      guestFailed: true,
    },
  });
  if (campaigns.length === 0) return [];
  const ids = campaigns.map((c) => c.id);
  const [stats, authors] = await Promise.all([
    db.$queryRaw<{ id: string; total: number; yes: number; no: number; delivered: number; blocked: number }[]>`
      SELECT r."campaignId" AS id,
        count(*)::int AS total,
        count(*) FILTER (WHERE r."answer" = 'YES')::int AS yes,
        count(*) FILTER (WHERE r."answer" = 'NO')::int AS no,
        count(*) FILTER (WHERE n."deliveredAt" IS NOT NULL)::int AS delivered,
        count(*) FILTER (WHERE n."blockedAt" IS NOT NULL)::int AS blocked
      FROM "BroadcastRecipient" r
      LEFT JOIN "Notification" n ON n."id" = r."notificationId"
      WHERE r."campaignId" IN (${Prisma.join(ids)})
      GROUP BY r."campaignId"`,
    db.user.findMany({
      where: { id: { in: [...new Set(campaigns.map((c) => c.createdById))] } },
      select: { id: true, login: true, employee: { select: { fullName: true } } },
    }),
  ]);
  const statById = new Map(stats.map((s) => [s.id, s]));
  const authorName = new Map(authors.map((u) => [u.id, u.employee?.fullName ?? u.login]));
  return campaigns.map(({ createdById, ...c }) => {
    const s = statById.get(c.id) ?? { total: 0, yes: 0, no: 0, delivered: 0, blocked: 0 };
    return {
      ...c,
      author: authorName.get(createdById) ?? "—",
      total: s.total + c.guestSent + c.guestFailed,
      yes: s.yes,
      no: s.no,
      none: s.total - s.yes - s.no,
      delivered: s.delivered + c.guestSent,
      blocked: s.blocked,
    };
  });
}

export const fmtDushanbe = (d: Date) =>
  d.toLocaleString("ru-RU", { timeZone: "Asia/Dushanbe", dateStyle: "short", timeStyle: "short" });
