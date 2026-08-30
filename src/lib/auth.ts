import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

const COOKIE = "faravon_session";
const MAX_AGE = 60 * 60 * 12; // 12h, ТЗ v2 §5.1

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
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
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
  return s;
}
