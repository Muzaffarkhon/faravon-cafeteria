"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireSession, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

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

  const currentOk = await bcrypt.compare(current, user.passwordHash);
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

  if (await bcrypt.compare(password, user.passwordHash)) {
    return { error: "Новый пароль должен отличаться от текущего." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, otpExpiresAt: null },
  });
  await audit({ actorId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id, newValue: { self: true } });

  // обновляем cookie-сессию (снимаем флаг обязательной смены, если был)
  await createSession({
    sub: user.id,
    login: user.login,
    roles: user.roles,
    employeeId: user.employeeId,
    mustChangePassword: false,
  });

  return { ok: true };
}
