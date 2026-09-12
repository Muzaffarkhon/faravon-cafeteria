"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";
import { sendTelegram } from "@/lib/notification-delivery";
import { escHtml } from "@/lib/notification-format";
import { hashPassword } from "@/lib/password";
import { issueOtpForUser } from "@/lib/otp";
import { normalizePhone, formatTajikPhone } from "@/lib/phone";
import { loginFromFullName, generateUniqueLogin } from "@/lib/translit";

function revalidateAll(threadId: string) {
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${threadId}`);
}

/** Ответить гостю: уходит в Telegram и сохраняется в переписке. */
export async function replyToThread(threadId: string, body: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    const text = body.trim();
    if (!text) throw new Error("Введите текст ответа.");

    const thread = await db.supportThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new Error("Диалог не найден.");

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан — отправка недоступна.");

    // Экранируем: это обычный текст от человека, а не шаблон с разметкой —
    // случайные `<`/`&` не должны ломать HTML-сообщение в Telegram.
    const ok = await sendTelegram(token, thread.telegramId, escHtml(text));
    if (!ok) throw new Error("Не удалось отправить сообщение в Telegram.");

    await db.$transaction([
      db.supportMessage.create({
        data: { threadId, direction: "OUT", body: text, authorId: s.user.id },
      }),
      db.supportMessage.updateMany({
        where: { threadId, direction: "IN", readAt: null },
        data: { readAt: new Date() },
      }),
      db.supportThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
    ]);

    await audit({
      actorId: s.user.id,
      action: "SUPPORT_REPLY_SENT",
      entityType: "SupportThread",
      entityId: threadId,
    });

    revalidateAll(threadId);
  });
}

/** Закрыть диалог. Если гость напишет снова — переоткроется сам. */
export async function closeThread(threadId: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    await db.supportThread.update({ where: { id: threadId }, data: { status: "CLOSED" } });
    await audit({
      actorId: s.user.id,
      action: "SUPPORT_THREAD_CLOSED",
      entityType: "SupportThread",
      entityId: threadId,
    });

    revalidateAll(threadId);
  });
}

/** Отметить входящие сообщения прочитанными (вызывается при открытии диалога). */
export async function markThreadRead(threadId: string): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "support.manage");

  await db.supportMessage.updateMany({
    where: { threadId, direction: "IN", readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/admin/support");
}

export type EmployeeMatch = {
  id: string;
  fullName: string;
  position: string;
  department: string;
  phoneNormalized: string | null;
  telegramId: string | null;
  hasUser: boolean;
};

/**
 * Ищет сотрудника по номеру телефона (если строка — валидный таджикский
 * номер) либо по подстроке ФИО. Используется в чате поддержки, чтобы найти
 * карточку сотрудника, не переходя в раздел «Пользователи».
 */
export async function findEmployeeForLink(query: string): Promise<{ error?: string; matches?: EmployeeMatch[] }> {
  const s = await requireSession();
  assertCan(s.roles, "support.manage");

  const q = query.trim();
  if (q.length < 2) return { matches: [] };

  const phone = formatTajikPhone(q) ? normalizePhone(q) : null;

  const employees = await db.employee.findMany({
    where: {
      archivedAt: null,
      ...(phone
        ? { OR: [{ phoneNormalized: phone }, { phoneSecondaryNormalized: phone }] }
        : { fullName: { contains: q, mode: "insensitive" as const } }),
    },
    select: {
      id: true,
      fullName: true,
      position: true,
      department: true,
      phoneNormalized: true,
      telegramId: true,
      user: { select: { id: true } },
    },
    take: 5,
    orderBy: { fullName: "asc" },
  });

  return {
    matches: employees.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      position: e.position,
      department: e.department,
      phoneNormalized: e.phoneNormalized,
      telegramId: e.telegramId,
      hasUser: !!e.user,
    })),
  };
}

export type LinkEmployeeResult = { error?: string; ok?: boolean; login?: string; otp?: string };

/**
 * Привязывает Telegram гостя из чата поддержки к найденной карточке
 * сотрудника: сохраняет номер (если валидный), создаёт учётку при
 * необходимости и выдаёт логин/временный пароль — уведомление уходит
 * тем же сообщением гостю в тот же чат.
 */
export async function linkEmployeeToThread(
  threadId: string,
  employeeId: string,
  rawPhone: string | null,
): Promise<LinkEmployeeResult> {
  const s = await requireSession();
  assertCan(s.roles, "support.manage");

  const thread = await db.supportThread.findUnique({ where: { id: threadId } });
  if (!thread) return { error: "Диалог не найден." };

  const employee = await db.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!employee || employee.archivedAt) return { error: "Сотрудник не найден." };
  if (!employee.isActive || employee.status === "TERMINATED") {
    return { error: "Учётная запись сотрудника неактивна." };
  }
  if (employee.telegramId && employee.telegramId !== thread.telegramId) {
    return { error: "Этот сотрудник уже привязан к другому Telegram-аккаунту." };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { error: "TELEGRAM_BOT_TOKEN не задан — отправка недоступна." };

  const phone = rawPhone ? formatTajikPhone(rawPhone) : null;
  const norm = phone ? normalizePhone(rawPhone!) : null;

  await db.employee.update({
    where: { id: employeeId },
    data: {
      telegramId: thread.telegramId,
      ...(phone && norm ? { phone, phoneNormalized: norm } : {}),
    },
  });

  let user = employee.user;
  if (!user) {
    const existingUsers = await db.user.findMany({ select: { login: true } });
    const takenLogins = new Set(existingUsers.map((u) => u.login.toLowerCase()));
    const login = generateUniqueLogin(loginFromFullName(employee.fullName), takenLogins);
    user = await db.user.create({
      data: {
        login,
        passwordHash: await hashPassword(randomUUID()),
        mustChangePassword: true,
        roles: ["EMPLOYEE"],
        employeeId,
      },
    });
    await audit({
      actorId: s.user.id,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      newValue: { login: user.login, roles: user.roles, employeeId, via: "support_chat" },
    });
  } else if (!user.isActive) {
    return { error: "Учётная запись сотрудника отключена." };
  }

  const otp = await issueOtpForUser(user.id, `admin:support_chat:${s.user.login}`, s.user.id);

  const plain = `Номер добавлен и ваш логин и временный пароль: ${user.login} / ${otp}. При входе система попросит его сменить.`;
  const html = `Номер добавлен и ваш логин и временный пароль: <code>${escHtml(user.login)}</code> / <code>${escHtml(otp)}</code>. При входе система попросит его сменить.`;

  const sent = await sendTelegram(token, thread.telegramId, html);
  if (!sent) return { error: "Не удалось отправить сообщение в Telegram." };

  await db.$transaction([
    db.supportMessage.create({ data: { threadId, direction: "OUT", body: plain, authorId: s.user.id } }),
    db.supportThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date(), ...(phone ? { phone } : {}) },
    }),
  ]);

  await audit({
    actorId: s.user.id,
    action: "TELEGRAM_LINKED",
    entityType: "Employee",
    entityId: employeeId,
    newValue: { via: "support_chat", threadId },
  });

  revalidateAll(threadId);
  return { ok: true, login: user.login, otp };
}
