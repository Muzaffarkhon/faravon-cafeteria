import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { issueOtpForUser } from "@/lib/otp";

/**
 * Идентификация сотрудника и выдача OTP — для webhook-роута Telegram-бота (§5.1).
 * Полинг-версия бота использует самодостаточный аналог в `bot/link.ts`.
 */

export type LinkResult = { login: string; otp: string; fullName: string };

/**
 * Канонизируем номер к 9-значному национальному (Таджикистан): только цифры,
 * отбрасываем код страны 992 и ведущий 0, берём последние 9. Так совпадают
 * «+992 92 630 94 49», «992926309449» (из Telegram-контакта) и «926309449».
 */
export function normalizePhone(raw: string): string {
  let d = String(raw).replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("992")) d = d.slice(3);
  if (d.length === 10 && d.startsWith("0")) d = d.slice(1);
  return d.length > 9 ? d.slice(-9) : d;
}

async function issueForEmployee(
  employee: { id: string; fullName: string; isActive: boolean; status: string },
  telegramId: string,
  via: string,
): Promise<LinkResult> {
  if (!employee.isActive || employee.status === "TERMINATED") {
    throw new Error("Учётная запись сотрудника неактивна. Обратитесь в HR.");
  }
  const user = await db.user.findUnique({ where: { employeeId: employee.id } });
  if (!user) throw new Error("Для сотрудника не заведена учётная запись. Обратитесь в HR.");
  if (!user.isActive) throw new Error("Учётная запись отключена. Обратитесь в HR.");

  const clash = await db.employee.findFirst({ where: { telegramId, NOT: { id: employee.id } } });
  if (clash) throw new Error("Этот Telegram уже привязан к другому сотруднику.");

  await db.employee.update({ where: { id: employee.id }, data: { telegramId } });
  const otp = await issueOtpForUser(user.id, via);
  await audit({
    actorId: user.id,
    action: "TELEGRAM_LINKED",
    entityType: "Employee",
    entityId: employee.id,
    newValue: { via },
  });
  return { login: user.login, otp, fullName: employee.fullName };
}

export async function linkByPhone(phone: string, telegramId: string): Promise<LinkResult> {
  const norm = normalizePhone(phone);
  if (norm.length < 7) throw new Error("Не удалось распознать номер телефона.");
  const candidates = await db.employee.findMany({ where: { phone: { not: null } } });
  const match = candidates.find((e) => normalizePhone(e.phone!) === norm);
  if (!match) throw new Error("Сотрудник с таким номером не найден в справочнике. Обратитесь в HR.");
  return issueForEmployee(match, telegramId, "telegram:phone");
}

export async function linkByCode(rawCode: string, telegramId: string): Promise<LinkResult> {
  const code = rawCode.trim().toUpperCase();
  const rec = await db.identificationCode.findUnique({ where: { code } });
  if (!rec || rec.usedAt) throw new Error("Код недействителен или уже использован.");
  if (rec.expiresAt < new Date()) throw new Error("Срок действия кода истёк. Запросите новый у HR.");

  const employee = await db.employee.findUnique({ where: { id: rec.employeeId } });
  if (!employee) throw new Error("Сотрудник не найден.");

  const result = await issueForEmployee(employee, telegramId, "telegram:code");
  await db.identificationCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  return result;
}

export async function reissueOtp(telegramId: string): Promise<LinkResult> {
  const employee = await db.employee.findUnique({ where: { telegramId } });
  if (!employee) throw new Error("Этот Telegram не привязан. Поделитесь контактом или введите код от HR.");
  return issueForEmployee(employee, telegramId, "telegram:reissue");
}
