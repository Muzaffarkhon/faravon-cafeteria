/**
 * Идентификация сотрудника и выдача OTP для Telegram-бота (long polling).
 * Сама логика — в `src/lib/telegram-link-core.ts`, общей с webhook-версией
 * (`src/lib/telegram-link.ts`, Vercel). Этот файл — только привязка к окружению
 * бота: отдельный процесс со своим Prisma-клиентом (не завися от server-only
 * модулей приложения), своя выдача OTP и запись в журнал аудита.
 */
import { randomInt } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createTelegramLink, isKnownTelegramId as isKnownTelegramIdFor } from "../src/lib/telegram-link-core";

export { normalizePhone, isTajikInternational } from "../src/lib/phone";
export { type LinkResult, type PhoneVerifyResult, SafeLinkError, PhoneNotRecognizedError } from "../src/lib/telegram-link-core";

const db = new PrismaClient();

const OTP_TTL_HOURS = 24;

async function issueOtp(userId: string, via: string): Promise<string> {
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const passwordHash = await bcrypt.hash(otp, 12);
  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      otpExpiresAt: new Date(Date.now() + OTP_TTL_HOURS * 3600_000),
      failedLoginCount: 0,
      lockedUntil: null,
      sessionEpoch: { increment: 1 }, // отзываем прежние сессии пользователя
    },
  });
  await db.auditLog.create({
    data: { actorId: userId, action: "OTP_ISSUED", entityType: "User", entityId: userId, newValue: { via } },
  });
  return otp;
}

async function audit(entry: { actorId: string; action: string; entityType: string; entityId: string; newValue: Prisma.InputJsonValue }) {
  await db.auditLog.create({ data: entry });
}

export const { linkByPhone, linkByCode, verifyPhoneForCandidate, reissueOtp } = createTelegramLink({
  db,
  issueOtp,
  audit,
});

/** true, если этот Telegram уже привязан к действующему сотруднику или служебной учётке. */
export const isKnownTelegramId = (telegramId: string) => isKnownTelegramIdFor(db, telegramId);
