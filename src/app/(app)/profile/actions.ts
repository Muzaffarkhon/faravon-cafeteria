"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { issueIdentificationCode } from "@/lib/otp";

export type ProfilePwState = { ok?: boolean; error?: string };
export type ProfileContactState = { ok?: boolean; error?: string };

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

/** Сотрудник сам меняет свой телефон (для идентификации в Telegram-боте, §5.1). */
export async function updateOwnPhone(
  _prev: ProfileContactState,
  formData: FormData,
): Promise<ProfileContactState> {
  const session = await requireSession();
  if (!session.user.employeeId) return { error: "У учётной записи нет карточки сотрудника." };

  const raw = String(formData.get("phone") ?? "").trim();
  const phone = raw || null;
  if (phone && !/^[+()\d][\d\s()-]{4,}$/.test(phone)) {
    return { error: "Телефон: только цифры, пробелы и знаки + ( ) -, минимум 5 символов." };
  }

  const before = await db.employee.findUnique({ where: { id: session.user.employeeId } });
  await db.employee.update({ where: { id: session.user.employeeId }, data: { phone } });
  await audit({
    actorId: session.user.id,
    action: "EMPLOYEE_CONTACT_CHANGED",
    entityType: "Employee",
    entityId: session.user.employeeId,
    oldValue: { phone: before?.phone ?? null },
    newValue: { phone, self: true },
  });
  revalidatePath("/profile");
  return { ok: true };
}

/** Сотрудник сам получает код для привязки Telegram-бота (§5.1). */
export async function linkOwnTelegram(): Promise<{ code: string } | { error: string }> {
  const session = await requireSession();
  if (!session.user.employeeId) return { error: "У учётной записи нет карточки сотрудника." };
  const emp = await db.employee.findUnique({ where: { id: session.user.employeeId } });
  if (!emp) return { error: "Карточка сотрудника не найдена." };
  if (emp.telegramId) return { error: "Telegram уже привязан. Сначала отвяжите текущий." };
  const code = await issueIdentificationCode(session.user.employeeId, session.user.id);
  revalidatePath("/profile");
  return { code };
}

/**
 * Служебная учётная запись (без карточки сотрудника — подрядчик, C&B) сама
 * привязывает Telegram по числовому ID (узнаётся командой /id в боте).
 */
export async function setOwnTelegramId(
  _prev: ProfileContactState,
  formData: FormData,
): Promise<ProfileContactState> {
  const session = await requireSession();
  if (session.user.employeeId) {
    return { error: "У вашей учётки есть карточка сотрудника — используйте кнопку «Привязать Telegram» выше." };
  }
  const telegramId = String(formData.get("telegramId") ?? "").trim();
  if (!/^\d{4,20}$/.test(telegramId)) {
    return { error: "Telegram ID — это число. Узнать: отправьте боту команду /id." };
  }
  const clash = await db.user.findFirst({
    where: { telegramId, id: { not: session.user.id } },
    select: { id: true },
  });
  if (clash) return { error: "Этот Telegram уже привязан к другой учётной записи." };

  await db.user.update({ where: { id: session.user.id }, data: { telegramId } });
  await audit({
    actorId: session.user.id,
    action: "TELEGRAM_LINKED",
    entityType: "User",
    entityId: session.user.id,
    newValue: { self: true },
  });
  revalidatePath("/profile");
  return { ok: true };
}

export async function unlinkOwnTelegramId(): Promise<{ ok: true } | { error: string }> {
  const session = await requireSession();
  await db.user.update({ where: { id: session.user.id }, data: { telegramId: null } });
  await audit({
    actorId: session.user.id,
    action: "TELEGRAM_UNLINKED",
    entityType: "User",
    entityId: session.user.id,
    newValue: { self: true },
  });
  revalidatePath("/profile");
  return { ok: true };
}

/** Сотрудник сам отвязывает свой Telegram. */
export async function unlinkOwnTelegram(): Promise<{ ok: true } | { error: string }> {
  const session = await requireSession();
  if (!session.user.employeeId) return { error: "У учётной записи нет карточки сотрудника." };
  await db.employee.update({
    where: { id: session.user.employeeId },
    data: { telegramId: null },
  });
  await audit({
    actorId: session.user.id,
    action: "TELEGRAM_UNLINKED",
    entityType: "Employee",
    entityId: session.user.employeeId,
    newValue: { self: true },
  });
  revalidatePath("/profile");
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
