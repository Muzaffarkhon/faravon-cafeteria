import "server-only";
import type { ItemStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  SEGMENTS,
  CARD_AUDIENCES,
  CAMPAIGN_ANSWERS,
  type Segment,
  type CardAudience,
  type CampaignAnswer,
} from "./broadcast-segments";
import { LOCALES, asLocale, type Locale } from "./i18n/shared";
import { fmtDate } from "@/lib/dushanbe-date";

/**
 * Аудитория рассылки. Одна функция на предпросмотр и на отправку — чтобы то, что
 * админ видит перед отправкой, совпадало с тем, что реально уйдёт.
 */

export type AudienceFilters = {
  segment: Segment;
  department: string;
  position: string;
  q: string;
  /** Сегмент BY_CARD: льгота, период и кому из выбравших. */
  cardId: string;
  periodId: string;
  cardAudience: CardAudience;
  /** Сегмент BY_CAMPAIGN: прошлая рассылка с подтверждением и какой ответ нужен. */
  campaignId: string;
  campaignAnswer: CampaignAnswer;
};

export type PreviewRow = { key: string; name: string; sub: string; telegram: boolean };

export type Recipient = { id: string; locale: Locale };

export type Audience = {
  /** Пользователи, которым ставим уведомление в очередь (язык — из User.locale, по умолчанию русский). */
  users: Recipient[];
  /** Чаты «гостей» — им пишем напрямую, у них нет учётной записи (язык — из Telegram). */
  guests: Recipient[];
  /** Сколько получателей на каждом языке — чтобы админ видел, для кого нужен перевод. */
  byLocale: Record<Locale, number>;
  total: number;
  withoutTelegram: number;
  rows: PreviewRow[];
  error?: string;
};

export const PREVIEW_LIMIT = 50;

export function parseFilters(raw: Record<string, string | string[] | undefined>): AudienceFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const seg = one(raw.segment);
  const aud = one(raw.cardAudience);
  const ans = one(raw.campaignAnswer);
  return {
    segment: (SEGMENTS as readonly string[]).includes(seg) ? (seg as Segment) : "ALL",
    department: one(raw.department).trim(),
    position: one(raw.position).trim(),
    q: one(raw.q).trim().slice(0, 80),
    cardId: one(raw.cardId).trim(),
    periodId: one(raw.periodId).trim(),
    cardAudience: (CARD_AUDIENCES as readonly string[]).includes(aud) ? (aud as CardAudience) : "BOTH",
    campaignId: one(raw.campaignId).trim(),
    campaignAnswer: (CAMPAIGN_ANSWERS as readonly string[]).includes(ans) ? (ans as CampaignAnswer) : "YES",
  };
}

/** Статусы позиции для «кому из выбравших»: выбрал = подал и не отменено/не отклонено. */
const CARD_AUDIENCE_STATUSES: Record<CardAudience, ItemStatus[]> = {
  SELECTED: ["PENDING", "APPROVED", "COUPON_CREATED"],
  ISSUED: ["COUPON_ISSUED"],
  BOTH: ["PENDING", "APPROVED", "COUPON_CREATED", "COUPON_ISSUED"],
};

const countByLocale = (list: Recipient[]) => {
  const r = Object.fromEntries(LOCALES.map((l) => [l, 0])) as Record<Locale, number>;
  for (const x of list) r[x.locale]++;
  return r;
};

const empty = (error?: string): Audience => ({
  users: [],
  guests: [],
  byLocale: countByLocale([]),
  total: 0,
  withoutTelegram: 0,
  rows: [],
  error,
});

export async function resolveAudience(f: AudienceFilters): Promise<Audience> {
  return f.segment === "NOT_REGISTERED" ? resolveGuests() : resolveEmployees(f);
}

async function resolveGuests(): Promise<Audience> {
  const [employees, users] = await Promise.all([
    db.employee.findMany({ where: { telegramId: { not: null } }, select: { telegramId: true } }),
    db.user.findMany({ where: { telegramId: { not: null } }, select: { telegramId: true } }),
  ]);
  const linked = new Set<string>();
  for (const r of [...employees, ...users]) if (r.telegramId) linked.add(r.telegramId);

  const guests = await db.telegramGuest.findMany({ where: { blockedAt: null }, orderBy: { lastStartAt: "desc" } });
  const fresh = guests.filter((g) => !linked.has(g.telegramId));
  const guestList = fresh.map((g) => ({ id: g.telegramId, locale: asLocale(g.locale) ?? "ru" }));
  return {
    users: [],
    guests: guestList,
    byLocale: countByLocale(guestList),
    total: fresh.length,
    withoutTelegram: 0,
    rows: fresh.slice(0, PREVIEW_LIMIT).map((g) => ({
      key: g.telegramId,
      name: `Telegram ${g.telegramId}`,
      sub: `Последняя активность в боте: ${fmtDate(g.lastStartAt)}`,
      telegram: true,
    })),
  };
}

async function resolveEmployees(f: AudienceFilters): Promise<Audience> {
  const and: Prisma.EmployeeWhereInput[] = [];
  if (f.department) and.push({ department: f.department });
  if (f.position) and.push({ position: f.position });
  if (f.q) {
    const digits = f.q.replace(/\D/g, "");
    and.push({
      OR: [
        { fullName: { contains: f.q, mode: "insensitive" } },
        ...(digits.length >= 3
          ? [{ phoneNormalized: { contains: digits.slice(-9) } }, { phoneSecondaryNormalized: { contains: digits.slice(-9) } }]
          : []),
      ],
    });
  }

  const userWhere: Prisma.UserWhereInput = { isActive: true };
  if (f.segment === "NEVER_LOGGED_IN") {
    userWhere.lastLoginAt = null;
    and.push({ telegramId: { not: null } }); // «зарегистрировался» = привязал Telegram через бота
  }
  if (f.segment === "NO_CHOICE") {
    const period = await db.period.findFirst({ where: { status: "OPEN" }, select: { id: true } });
    if (!period) return empty("Нет открытого периода — выбирать «не выбравших» не из чего.");
    userWhere.lastLoginAt = { not: null };
    and.push({
      applications: { none: { periodId: period.id, items: { some: { status: { notIn: ["DRAFT", "CANCELLED"] } } } } },
    });
  }
  if (f.segment === "BY_CARD") {
    if (!f.cardId) return empty("Выберите льготу.");
    if (!f.periodId) return empty("Выберите период.");
    and.push({
      applications: {
        some: {
          periodId: f.periodId,
          items: { some: { cardId: f.cardId, status: { in: CARD_AUDIENCE_STATUSES[f.cardAudience] } } },
        },
      },
    });
  }

  if (f.segment === "BY_CAMPAIGN") {
    if (!f.campaignId) return empty("Выберите рассылку.");
    const answer: Record<CampaignAnswer, Prisma.BroadcastRecipientWhereInput> = {
      YES: { answer: "YES" },
      NO: { answer: "NO" },
      NONE: { answer: null },
      ANSWERED: { answer: { not: null } },
      ALL: {},
    };
    userWhere.broadcastRecipients = { some: { campaignId: f.campaignId, ...answer[f.campaignAnswer] } };
  }

  const base: Prisma.EmployeeWhereInput = {
    isActive: true,
    archivedAt: null,
    user: { is: userWhere },
    ...(and.length ? { AND: and } : {}),
  };

  const people = await db.employee.findMany({
    where: base,
    select: { fullName: true, department: true, position: true, telegramId: true, user: { select: { id: true, locale: true } } },
    orderBy: { fullName: "asc" },
  });
  const reachable = people.filter((p) => p.telegramId && p.user);
  const userList = reachable.map((p) => ({ id: p.user!.id, locale: asLocale(p.user!.locale) ?? "ru" }));
  return {
    users: userList,
    guests: [],
    byLocale: countByLocale(userList),
    total: people.length,
    withoutTelegram: people.length - reachable.length,
    rows: people.slice(0, PREVIEW_LIMIT).map((p) => ({
      key: p.user?.id ?? p.fullName,
      name: p.fullName,
      sub: `${p.department} · ${p.position}`,
      telegram: !!p.telegramId,
    })),
  };
}
