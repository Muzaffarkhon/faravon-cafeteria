"use server";

import { db } from "@/lib/db";
import { requireSession, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/password";

export type ProfilePwState = { ok?: boolean; error?: string };

export async function changeOwnPassword(
  _prev: ProfilePwState,
  formData: FormData,
): Promise<ProfilePwState> {
  const session = await requireSession();

  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !password || !confirm) return { error: "Заполните все поля." };
  if (password.length < 8) return { error: "Новый пароль должен быть не короче 8 символов." };
  if (!/[a-zа-я]/i.test(password) || !/[0-9]/.test(password)) {
    return { error: "Новый пароль должен содержать буквы и цифры." };
  }
  if (password !== confirm) return { error: "Новый пароль и подтверждение не совпадают." };

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "Пользователь не найден." };

  const currentOk = await verifyPassword(current, user.passwordHash);
  if (!currentOk) {
    await audit({
      actorId: user.id,
      action: "PASSWORD_CHANGE_FAILED",
      entityType: "User",
      entityId: user.id,
      newValue: { reason: "wrong_current" },
    });
    return { error: "Текущий пароль указан неверно." };
  }

  if (await verifyPassword(password, user.passwordHash)) {
    return { error: "Новый пароль должен отличаться от текущего." };
  }

  const passwordHash = await hashPassword(password);
  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      otpExpiresAt: null,
      sessionEpoch: { increment: 1 }, // §5.1: смена пароля завершает сессии на других устройствах
    },
  });
  await audit({ actorId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id, newValue: { self: true } });

  // текущая сессия остаётся живой — пересоздаём cookie с новым epoch
  await createSession({
    sub: user.id,
    login: user.login,
    roles: user.roles,
    employeeId: user.employeeId,
    mustChangePassword: false,
    epoch: updated.sessionEpoch,
  });

  return { ok: true };
}

/** §5.1: завершить сессии на всех других устройствах (текущая остаётся). */
export async function revokeOtherSessions(): Promise<{ ok: true }> {
  const session = await requireSession();
  const updated = await db.user.update({
    where: { id: session.user.id },
    data: { sessionEpoch: { increment: 1 } },
  });
  await audit({
    actorId: session.user.id,
    action: "SESSIONS_REVOKED",
    entityType: "User",
    entityId: session.user.id,
  });
  await createSession({
    sub: session.user.id,
    login: session.user.login,
    roles: session.user.roles,
    employeeId: session.user.employeeId,
    mustChangePassword: false,
    epoch: updated.sessionEpoch,
  });
  return { ok: true };
}
