"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/password";

const MAX_FAILED = 5; // §5.1
const LOCK_MINUTES = 15;
const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX_FAILED = 5;

export type LoginState = { error?: string };

async function clientMeta() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : h.get("x-real-ip") || "").trim() || "unknown";
  const userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  return { ip, userAgent };
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const login = String(formData.get("login") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";
  const honeypot = String(formData.get("company") ?? ""); // скрытое поле — заполняют только боты

  if (honeypot) return { error: "Неверный логин или пароль." };
  if (!login || !password) return { error: "Введите логин и пароль." };

  const { ip, userAgent } = await clientMeta();
  const genericError = { error: "Неверный логин или пароль." };

  // Лимит перебора по IP (§5.1)
  const since = new Date(Date.now() - IP_WINDOW_MS);
  const ipFails = await db.loginAttempt.count({
    where: { ip, success: false, createdAt: { gt: since } },
  });
  if (ip !== "unknown" && ipFails >= IP_MAX_FAILED) {
    await db.loginAttempt.create({ data: { login, ip, userAgent, success: false } });
    return {
      error: "Слишком много попыток входа с вашего адреса. Повторите через 15 минут.",
    };
  }

  const fail = async (reason: string) => {
    await db.loginAttempt.create({ data: { login, ip, userAgent, success: false } });
    void reason;
    return genericError;
  };

  const user = await db.user.findUnique({ where: { login } });
  if (!user || !user.isActive) return fail("no-user");

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await db.loginAttempt.create({ data: { login, ip, userAgent, success: false } });
    return { error: "Учётная запись временно заблокирована. Повторите позже." };
  }

  if (user.mustChangePassword && user.otpExpiresAt && user.otpExpiresAt < new Date()) {
    return { error: "Одноразовый код истёк. Запросите новый через Telegram-бот." };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil:
          failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit({ actorId: user.id, action: "LOGIN_FAILED", entityType: "User", entityId: user.id });
    return fail("bad-password");
  }

  // Успех: сбрасываем счётчики, при слабом хеше — пере-хешируем (§5.1, cost ≥ 12)
  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(needsRehash(user.passwordHash)
        ? { passwordHash: await hashPassword(password) }
        : {}),
    },
  });
  await db.loginAttempt.create({ data: { login, ip, userAgent, success: true } });

  await createSession({
    sub: user.id,
    login: user.login,
    roles: user.roles,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
    epoch: user.sessionEpoch,
  });
  await audit({ actorId: user.id, action: "LOGIN_OK", entityType: "User", entityId: user.id });

  redirect(user.mustChangePassword ? "/change-password" : next);
}
