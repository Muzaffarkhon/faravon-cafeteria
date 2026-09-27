import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ensureRbac } from "@/lib/rbac-load";
import { clientMeta } from "@/lib/client-meta";
import { parseUserAgent } from "@/lib/user-agent";
import { lookupGeoIp } from "@/lib/geo-ip";
import type { Role } from "@prisma/client";

const COOKIE = "faravon_session";
const MAX_AGE = 60 * 60 * 12; // 12h, ТЗ v2 §5.1
// Подрядчик (CONTRACTOR) — общий PIN на кассу партнёра, залогинен на одном
// устройстве постоянно (не личный аккаунт сотрудника, короткая сессия тут
// только создавала бы лишний повод для кассира вводить PIN заново каждый
// день). Реальный «выход» для скомпрометированного терминала — деактивировать
// учётку или перевыпустить PIN (issueOtpForUser поднимает sessionEpoch,
// который здесь и дальше проверяется в getSession()).
const MAX_AGE_CONTRACTOR = 60 * 60 * 24 * 365 * 10; // 10 лет — по факту «навсегда»
// Не чаще раза в минуту — connection_limit=1 на боевой БД, лишний write на
// каждый рендер страницы недопустим (см. хендоф от 27 сентября про
// исчерпание пула соединений).
const TOUCH_THROTTLE_MS = 60_000;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  sub: string; // user id
  login: string;
  roles: Role[];
  employeeId: string | null;
  mustChangePassword: boolean;
  epoch?: number; // §5.1: должен совпасть с User.sessionEpoch, иначе сессия отозвана
};

/** Что реально лежит в подписанном JWT — включает sid, которого нет во входном SessionPayload. */
export type SessionToken = SessionPayload & { epoch: number; sid: string };

export async function createSession(payload: SessionPayload) {
  const existing = await readToken();
  const epoch =
    payload.epoch ??
    (
      await db.user.findUnique({
        where: { id: payload.sub },
        select: { sessionEpoch: true },
      })
    )?.sessionEpoch ??
    0;

  // Переиспользуем sid текущей валидной сессии ТОГО ЖЕ пользователя —
  // createSession перевыпускает JWT не только при логине, но и при смене
  // пароля/профиля (см. profile/actions.ts, change-password/actions.ts):
  // это не новое устройство, новую строку UserSession заводить не нужно.
  // Другой пользователь (общий терминал подрядчика) или невалидная/отсутствующая
  // кука — считаем новой сессией.
  let sid = existing && existing.sub === payload.sub ? existing.sid : null;
  if (!sid) {
    sid = randomUUID();
    const { ip, userAgent } = await clientMeta();
    const { device, browser } = parseUserAgent(userAgent);
    const geo = await lookupGeoIp(ip);
    await db.userSession.create({
      data: {
        id: sid,
        userId: payload.sub,
        device,
        browser,
        ip: ip === "unknown" ? null : ip,
        city: geo.city,
        country: geo.country,
      },
    });
  }

  const maxAge = payload.roles.includes("CONTRACTOR") ? MAX_AGE_CONTRACTOR : MAX_AGE;
  const token = await new SignJWT({ ...payload, epoch, sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function destroySession() {
  const tok = await readToken();
  if (tok?.sid) {
    await db.userSession.updateMany({
      where: { id: tok.sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function readToken(): Promise<SessionToken | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionToken;
  } catch {
    return null;
  }
}

/** Full session backed by a fresh DB check (isActive, roles). */
export const getSession = cache(async () => {
  const tok = await readToken();
  if (!tok) return null;
  const user = await db.user.findUnique({
    where: { id: tok.sub },
    include: { employee: true },
  });
  if (!user || !user.isActive) return null;
  if ((tok.epoch ?? 0) !== user.sessionEpoch) return null; // сессия отозвана «выйти со всех устройств»
  if (tok.sid) {
    await db.userSession.updateMany({
      where: { id: tok.sid, lastSeenAt: { lt: new Date(Date.now() - TOUCH_THROTTLE_MS) } },
      data: { lastSeenAt: new Date() },
    });
  }
  return {
    user,
    roles: user.roles,
    employee: user.employee,
    mustChangePassword: user.mustChangePassword,
  };
});

export async function requireSession() {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  await ensureRbac(); // держим матрицу прав свежей и для server actions / route handlers (TTL внутри)
  return s;
}
