import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { db } from "@/lib/db";
import { ensureRbac } from "@/lib/rbac-load";
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

export async function createSession(payload: SessionPayload) {
  const epoch =
    payload.epoch ??
    (
      await db.user.findUnique({
        where: { id: payload.sub },
        select: { sessionEpoch: true },
      })
    )?.sessionEpoch ??
    0;
  const maxAge = payload.roles.includes("CONTRACTOR") ? MAX_AGE_CONTRACTOR : MAX_AGE;
  const token = await new SignJWT({ ...payload, epoch })
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
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function readToken(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
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
