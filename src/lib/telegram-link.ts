import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { issueOtpForUser } from "@/lib/otp";
import { createTelegramLink, isKnownTelegramId as isKnownTelegramIdFor } from "@/lib/telegram-link-core";

/**
 * Идентификация сотрудника и выдача OTP — для webhook-роута Telegram-бота (§5.1).
 * Сама логика (рейт-лимиты, сопоставление по номеру/коду, запрет дублей) — в
 * `@/lib/telegram-link-core`, общей с long-polling версией бота (`bot/link.ts`).
 * Этот файл — только привязка к серверному окружению Next: настоящий Prisma-клиент,
 * выдача OTP с учётом роли (issueOtpForUser) и запись в общий журнал аудита.
 */

export {
  type LinkResult,
  type PhoneVerifyResult,
  normalizePhone,
  SafeLinkError,
  PhoneNotRecognizedError,
} from "@/lib/telegram-link-core";

export const { linkByPhone, linkByCode, verifyPhoneForCandidate, reissueOtp } = createTelegramLink({
  db,
  issueOtp: (userId, via) => issueOtpForUser(userId, via),
  audit,
});

/** true, если этот Telegram уже привязан к действующему сотруднику или служебной учётке. */
export const isKnownTelegramId = (telegramId: string) => isKnownTelegramIdFor(db, telegramId);
