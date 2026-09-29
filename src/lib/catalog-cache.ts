import "server-only";
import { db } from "@/lib/db";
import type { BenefitCard, Partner, PartnerBanner, Period, TextBlock } from "@prisma/client";

/**
 * Серверный кэш общих каталожных данных (карточки, баннеры, тексты).
 *
 * Эти данные одинаковы для всех сотрудников и меняются редко (только администратором),
 * но запрашиваются при каждом открытии главной страницы.
 * In-memory TTL (60 секунд) + принудительный сброс при мутациях в админке снижает
 * нагрузку на PostgreSQL при наплыве 3000 сотрудников с тысяч запросов до нуля.
 */

type BenefitCardWithPartner = BenefitCard & { partner: Partner | null };

type CardsCacheBundle = {
  recognition: BenefitCard[];
  care: BenefitCard[];
  flex: BenefitCardWithPartner[];
  loadedAt: number;
};

let cardsCache: CardsCacheBundle | null = null;
const CARDS_TTL_MS = 60_000;

export async function getCachedBenefitCards(): Promise<{
  recognition: BenefitCard[];
  care: BenefitCard[];
  flex: BenefitCardWithPartner[];
}> {
  const now = Date.now();
  if (cardsCache && now - cardsCache.loadedAt < CARDS_TTL_MS) {
    return cardsCache;
  }

  const [recognition, care, flex] = await Promise.all([
    db.benefitCard.findMany({
      where: { block: "RECOGNITION", status: "PUBLISHED", archivedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
    db.benefitCard.findMany({
      where: { block: "CARE", status: "PUBLISHED", archivedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
    db.benefitCard.findMany({
      where: { block: "FLEX", status: "PUBLISHED", archivedAt: null, coinPrice: null },
      orderBy: { sortOrder: "asc" },
      include: { partner: true },
    }),
  ]);

  cardsCache = { recognition, care, flex, loadedAt: now };
  return cardsCache;
}

export function invalidateCardsCache() {
  cardsCache = null;
}

type BannersCacheBundle = {
  banners: PartnerBanner[];
  loadedAt: number;
};

let bannersCache: BannersCacheBundle | null = null;
const BANNERS_TTL_MS = 60_000;

export async function getCachedActiveBanners(): Promise<PartnerBanner[]> {
  const now = Date.now();
  if (bannersCache && now - bannersCache.loadedAt < BANNERS_TTL_MS) {
    return bannersCache.banners;
  }

  const nowDate = new Date();
  const banners = await db.partnerBanner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: nowDate } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: nowDate } }] },
      ],
    },
    orderBy: { sortOrder: "asc" },
  });

  bannersCache = { banners, loadedAt: now };
  return banners;
}

export function invalidateBannersCache() {
  bannersCache = null;
}

type TextBlocksCacheBundle = {
  goal: TextBlock | null;
  notice: TextBlock | null;
  loadedAt: number;
};

let textsCache: TextBlocksCacheBundle | null = null;
const TEXTS_TTL_MS = 60_000;

export async function getCachedTextBlocks(): Promise<{
  goal: TextBlock | null;
  notice: TextBlock | null;
}> {
  const now = Date.now();
  if (textsCache && now - textsCache.loadedAt < TEXTS_TTL_MS) {
    return textsCache;
  }

  const [goal, notice] = await Promise.all([
    db.textBlock.findUnique({ where: { key: "GOAL" } }),
    db.textBlock.findUnique({ where: { key: "NOVELTY_NOTICE" } }),
  ]);

  textsCache = { goal, notice, loadedAt: now };
  return textsCache;
}

export function invalidateTextBlocksCache() {
  textsCache = null;
}

type PeriodCacheBundle = {
  period: (Period & { windowOpen: boolean }) | null;
  loadedAt: number;
};

let periodCache: PeriodCacheBundle | null = null;
const PERIOD_TTL_MS = 30_000;

export async function getCachedCurrentPeriod(): Promise<(Period & { windowOpen: boolean }) | null> {
  const now = Date.now();
  if (periodCache && now - periodCache.loadedAt < PERIOD_TTL_MS) {
    return periodCache.period;
  }

  const nowDate = new Date();
  const p = await db.period.findFirst({
    where: { status: "OPEN" },
    orderBy: { startDate: "desc" },
  });

  const period = p ? { ...p, windowOpen: p.windowStart <= nowDate && p.windowEnd >= nowDate } : null;
  periodCache = { period, loadedAt: now };
  return period;
}

export function invalidatePeriodCache() {
  periodCache = null;
}
