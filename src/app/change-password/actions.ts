"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";

export type ChangeState = { error?: string };

export async function changePasswordAction(
  _prev: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const session = await getSession();
  if (!session) redirect("/login");

  // Этот экран — только принудительная смена после входа по OTP. Обычная смена
  // пароля идёт через профиль (`changeOwnPassword`) и требует текущий пароль.
  // Без этой проверки любая перехваченная сессия меняла пароль за один запрос.
  if (!session.mustChangePassword) redirect("/profile");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { error: "Пароль должен быть не короче 8 символов." };
  if (!/[a-zа-я]/i.test(password) || !/[0-9]/.test(password)) {
    return { error: "Пароль должен содержать буквы и цифры." };
  }
  if (password !== confirm) return { error: "Пароли не совпадают." };

  const passwordHash = await hashPassword(password);
  const updated = await db.user.update({
    where: { id: session.user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      otpExpiresAt: null,
      sessionEpoch: { increment: 1 },
    },
  });
  await audit({ actorId: session.user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: session.user.id });

  await createSession({
    sub: session.user.id,
    login: session.user.login,
    roles: session.user.roles,
    employeeId: session.user.employeeId,
    mustChangePassword: false,
    epoch: updated.sessionEpoch,
  });

  redirect("/");
}
