"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

// Фиктивный хэш (cost 12): сверяемся с ним, когда логина нет, чтобы время
// ответа не выдавало существование учётной записи (timing-атака / перебор логинов).
const DUMMY_HASH = "$2b$12$WMakJ6WuXA6D24/EiklcP.RTTq9Nhd/LwtFImI5s8zsr0H/RactTa";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const login = String(formData.get("login") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  if (!login || !password) return { error: "Введите логин и пароль." };

  const user = await db.user.findUnique({ where: { login } });
  const genericError = { error: "Неверный логин или пароль." };

  if (!user || !user.isActive) {
    await bcrypt.compare(password, DUMMY_HASH); // выравниваем время ответа
    return genericError;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: `Учётная запись временно заблокирована. Повторите позже.` };
  }

  if (user.mustChangePassword && user.otpExpiresAt && user.otpExpiresAt < new Date()) {
    return { error: "Одноразовый код истёк. Запросите новый через Telegram-бот." };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil:
          failed >= MAX_FAILED
            ? new Date(Date.now() + LOCK_MINUTES * 60_000)
            : null,
      },
    });
    await audit({ actorId: user.id, action: "LOGIN_FAILED", entityType: "User", entityId: user.id });
    return genericError;
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await createSession({
    sub: user.id,
    login: user.login,
    roles: user.roles,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
  });
  await audit({ actorId: user.id, action: "LOGIN_OK", entityType: "User", entityId: user.id });

  redirect(user.mustChangePassword ? "/change-password" : next);
}
