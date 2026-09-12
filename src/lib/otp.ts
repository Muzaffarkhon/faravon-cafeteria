import "server-only";
import { randomInt, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";

export const OTP_TTL_HOURS = 24; // §5.1: OTP действует ограниченное время
export const ID_CODE_TTL_HOURS = 72;

/** 6-значный одноразовый пароль. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Код идентификации от администратора — 8 символов без похожих глифов. */
export function generateIdCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(8);
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Выдать пользователю пароль (замещает текущий). Возвращает код в открытом
 * виде — его отправляет Telegram-бот или показывает админ.
 *
 * Подрядчик (CONTRACTOR) — исключение из общей схемы: это общий PIN на кассу
 * точки партнёра (может стоять залогиненным на одном устройстве постоянно,
 * см. createSession), а не личный пароль сотрудника. Поэтому для него код не
 * истекает и не требует обязательной смены при входе — иначе кассиры каждый
 * день натыкались бы на экран смены пароля на общем терминале. Для всех
 * остальных ролей — как раньше: 24ч и обязательная смена при первом входе.
 */
export async function issueOtpForUser(
  userId: string,
  actorNote = "telegram-bot",
  /** Кто инициировал выдачу (для аудита). По умолчанию — сам пользователь
   *  (self-service через бот); при выдаче админом передавать id админа. */
  actorId: string = userId,
): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { roles: true } });
  const isContractorPin = !!user?.roles.includes("CONTRACTOR");

  const otp = generateOtp();
  const passwordHash = await hashPassword(otp);
  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: !isContractorPin,
      otpExpiresAt: isContractorPin ? null : new Date(Date.now() + OTP_TTL_HOURS * 3600_000),
      failedLoginCount: 0,
      lockedUntil: null,
      // Выдача нового кода = «начать вход заново»: отзываем все прежние сессии
      // этого пользователя (защита, если аккаунт/устройство было скомпрометировано).
      sessionEpoch: { increment: 1 },
    },
  });
  await audit({
    actorId,
    action: isContractorPin ? "PIN_ISSUED" : "OTP_ISSUED",
    entityType: "User",
    entityId: userId,
    newValue: { via: actorNote },
  });
  return otp;
}

/** Создать код идентификации для сотрудника (для передачи через администратора). */
export async function issueIdentificationCode(employeeId: string, issuedById: string): Promise<string> {
  // погасить прежние неиспользованные коды
  await db.identificationCode.updateMany({
    where: { employeeId, usedAt: null },
    data: { usedAt: new Date() },
  });
  const code = generateIdCode();
  await db.identificationCode.create({
    data: { code, employeeId, issuedById, expiresAt: new Date(Date.now() + ID_CODE_TTL_HOURS * 3600_000) },
  });
  await audit({ actorId: issuedById, action: "ID_CODE_ISSUED", entityType: "Employee", entityId: employeeId });
  return code;
}
