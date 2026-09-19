import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SEGMENTS, type Segment } from "./broadcast-segments";

/**
 * Аудитория рассылки. Одна функция на предпросмотр и на отправку — чтобы то, что
 * админ видит перед отправкой, совпадало с тем, что реально уйдёт.
 */

export type AudienceFilters = { segment: Segment; department: string; position: string; q: string };

export type PreviewRow = { key: string; name: string; sub: string; telegram: boolean };

export type Audience = {
  /** Пользователи, которым ставим уведомление в очередь. */
  userIds: string[];
  /** Чаты «гостей» — им пишем напрямую, у них нет учётной записи. */
  guestChatIds: string[];
  total: number;
  withoutTelegram: number;
  rows: PreviewRow[];
  error?: string;
};

export const PREVIEW_LIMIT = 50;

export function parseFilters(raw: Record<string, string | string[] | undefined>): AudienceFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const seg = one(raw.segment);
  return {
    segment: (SEGMENTS as readonly string[]).includes(seg) ? (seg as Segment) : "ALL",
    department: one(raw.department).trim(),
    position: one(raw.position).trim(),
    q: one(raw.q).trim().slice(0, 80),
  };
}

const empty = (error?: string): Audience => ({ userIds: [], guestChatIds: [], total: 0, withoutTelegram: 0, rows: [], error });

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
  return {
    userIds: [],
    guestChatIds: fresh.map((g) => g.telegramId),
    total: fresh.length,
    withoutTelegram: 0,
    rows: fresh.slice(0, PREVIEW_LIMIT).map((g) => ({
      key: g.telegramId,
      name: `Telegram ${g.telegramId}`,
      sub: `Последняя активность в боте:${g.lastStartAt.toLocaleDateString("ru-RU")}`,
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

  // Только действующие сотрудники с активной учёткой.
  const userWhere: Prisma.UserWhereInput = { isActive: true };
  if (f.segment === "NEVER_LOGGED_IN") {
    userWhere.lastLoginAt = null;
    and.push({ telegramId: { not: null } }); // «зарегистрировался» = привязал Telegram через бота
  }
  if (f.segment === "NO_CHOICE") {
    const period = await db.period.findFirst({ where: { status: "OPEN" }, select: { id: true } });
    if (!period) return empty("Нет открытого периода — выбирать «не выбравших» не из чего.");
    userWhere.lastLoginAt = { not: null };
    // «Выбрал» = есть поданная позиция (не черновик и не отменённая).
    and.push({
      applications: { none: { periodId: period.id, items: { some: { status: { notIn: ["DRAFT", "CANCELLED"] } } } } },
    });
  }

  const base: Prisma.EmployeeWhereInput = {
    isActive: true,
    archivedAt: null,
    user: { is: userWhere },
    ...(and.length ? { AND: and } : {}),
  };

  const people = await db.employee.findMany({
    where: base,
    select: { fullName: true, department: true, position: true, telegramId: true, user: { select: { id: true } } },
    orderBy: { fullName: "asc" },
  });
  const reachable = people.filter((p) => p.telegramId && p.user);
  return {
    userIds: reachable.map((p) => p.user!.id),
    guestChatIds: [],
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
