import "server-only";
import { db } from "@/lib/db";

/** «Короткая инфо» в сообщении: условие льготы обрезается, чтобы не раздувать чат. */
const MAX_CONDITION = 140;

const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

export type CardAnnouncementResult = {
  /** Сколько новых карточек объявлено. */
  cards: number;
  /** Сколько уведомлений поставлено в очередь (по одному на сотрудника на карточку). */
  queued: number;
};

/**
 * Утреннее оповещение о новых карточках витрины. Объявляются карточки блока FLEX,
 * которые опубликованы, активны (не «скоро»), не в архиве и ещё не объявлялись
 * (`announcedAt` пуст): и созданные сразу опубликованными, и переведённые из
 * черновика, и включённые из состояния «скоро». Получатели — активные сотрудники
 * с привязанным Telegram. Идемпотентно: карточку «забираем» атомарным
 * обновлением `announcedAt` ДО постановки в очередь, параллельный запуск её пропустит.
 * Саму доставку делает cron доставки (deliverTelegramNotifications).
 *
 * `dryRun` — только посчитать, ничего не помечая и не создавая (для проверки).
 */
export async function runNewCardAnnouncements(opts: { dryRun?: boolean } = {}): Promise<CardAnnouncementResult> {
  const cards = await db.benefitCard.findMany({
    where: { block: "FLEX", status: "PUBLISHED", isActive: true, archivedAt: null, announcedAt: null },
    select: { id: true, title: true, condition: true, partner: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (cards.length === 0) return { cards: 0, queued: 0 };

  const users = await db.user.findMany({
    where: { isActive: true, employee: { is: { isActive: true, archivedAt: null, telegramId: { not: null } } } },
    select: { id: true },
  });

  let announced = 0;
  let queued = 0;
  for (const c of cards) {
    if (opts.dryRun) {
      announced += 1;
      queued += users.length;
      continue;
    }
    const claim = await db.benefitCard.updateMany({
      where: { id: c.id, announcedAt: null },
      data: { announcedAt: new Date() },
    });
    if (claim.count !== 1) continue; // параллельный запуск уже занялся этой карточкой
    announced += 1;
    if (users.length === 0) continue;
    await db.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        event: "NEW_CARD",
        channel: "TELEGRAM",
        payload: {
          card: c.title,
          partner: c.partner?.name ?? "",
          condition: clip(c.condition, MAX_CONDITION),
        },
      })),
    });
    queued += users.length;
  }
  return { cards: announced, queued };
}
