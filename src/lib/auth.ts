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
const MAX_AGE_CONTRACTOR = 60 * 60 * 24 * 365 * 10; // 10 лет — по факту «навсегда»
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
