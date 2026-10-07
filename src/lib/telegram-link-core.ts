import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { isTajikInternational, normalizePhone, extractPhoneFromText } from "@/lib/phone";
import { loginFromFullName, generateUniqueLogin } from "@/lib/translit";
import { hashPassword } from "@/lib/password";

/**
 * Идентификация сотрудника и выдача OTP через Telegram-бота (§5.1) — общая логика для
 * webhook-роута (`src/lib/telegram-link.ts`, Vercel) и long-polling версии бота
 * (`bot/link.ts`, локальная разработка / не-serverless хостинг). Раньше это были два
 * независимых файла с комментарием «править синхронно» — на практике синхронизация
 * держалась на дисциплине, а не на коде. Здесь она гарантирована: сама логика (кто,
 * когда и сколько раз может привязаться) живёт в одном месте; каждый вызывающий
 * передаёт только свой Prisma-клиент и способ выдать OTP / записать аудит — то, что
 * действительно обязано различаться между server-only окружением Next и отдельным
 * процессом бота (см. `createTelegramLink`).
 */

export type LinkResult = { login: string; otp: string; fullName: string };

export { normalizePhone };

/**
 * Ошибка идентификации с «безопасным» текстом для пользователя. Всё, что не
 * SafeLinkError, наружу отдавать нельзя — только логировать (утечка внутренних
 * ошибок = оракул для перебора).
 */
export class SafeLinkError extends Error {}

/**
 * Подкласс SafeLinkError для случая «номер не привязался к сотруднику»
 * (не найден / несколько совпадений / битый формат — не различаем по тем же
 * причинам, что и общий текст ниже). Роут бота ловит именно этот тип, чтобы
 * при попытке через «Поделиться контактом» вместо тупика открыть чат
 * поддержки с уже известным (проверенным Telegram) номером — гостю останется
 * только написать ФИО, а не переотправлять номер текстом.
 */
export class PhoneNotRecognizedError extends SafeLinkError {}

const RL_WINDOW_MS = 15 * 60_000;
const RL_MAX_ATTEMPTS = 8; // всего попыток идентификации за окно на один telegramId
const RL_REISSUE_WINDOW_MS = 60 * 60_000;
const RL_MAX_REISSUE = 5; // /login (перевыпуск OTP) за час

const EMP_SELECT = {
  id: true,
  fullName: true,
  isActive: true,
  status: true,
  telegramId: true,
} as const;

type EmpRow = {
  id: string;
  fullName: string;
  isActive: boolean;
  status: string;
  telegramId: string | null;
};

/**
 * true, если этот Telegram уже привязан к действующему сотруднику или
 * служебной учётке. Такому человеку нельзя отвечать «мы вас не нашли,
 * напишите ФИО» — он уже опознан, просто прислал контактом номер, которого
 * нет в его карточке (не совпадает с записью, лишний номер и т.п.). Иначе
 * непризнанный номер уходит прямо в его уже опознанный тред и выглядит так,
 * будто систему сбросило до «неизвестный гость» (см. кейс Зокировой).
 */
export async function isKnownTelegramId(db: PrismaClient, telegramId: string): Promise<boolean> {
  const employee = await db.employee.findFirst({ where: { telegramId, archivedAt: null }, select: { id: true } });
  if (employee) return true;
  const serviceUser = await db.user.findFirst({ where: { telegramId, employeeId: null }, select: { id: true } });
  return !!serviceUser;
}

/** Результат проверки номера кандидата — различает «не похоже на номер»
 * (попытку не считаем) и «номер похож, но не тот» (считаем). */
export type PhoneVerifyResult = { kind: "granted"; result: LinkResult } | { kind: "no_number" } | { kind: "wrong_number" };

export type TelegramLinkDeps = {
  db: PrismaClient;
  /** Выдаёт новый пароль пользователю, возвращает его в открытом виде. */
  issueOtp(userId: string, via: string): Promise<string>;
  audit(entry: { actorId: string; action: string; entityType: string; entityId: string; newValue: Prisma.InputJsonValue }): Promise<void>;
};

/**
 * Собирает linkByPhone/linkByCode/verifyPhoneForCandidate/reissueOtp для конкретного
 * окружения (webhook или long-polling бот) — см. `TelegramLinkDeps`.
 */
export function createTelegramLink(deps: TelegramLinkDeps) {
  const { db, issueOtp, audit } = deps;

  async function assertNotRateLimited(telegramId: string, kind: "phone" | "code" | "reissue") {
    const since = new Date(Date.now() - RL_WINDOW_MS);
    const total = await db.telegramAuthAttempt.count({
      where: { telegramId, createdAt: { gt: since } },
    });
    if (total >= RL_MAX_ATTEMPTS) {
      throw new SafeLinkError("Слишком много попыток. Подождите 15 минут или напишите администратору.");
    }
    if (kind === "reissue") {
      const reissueSince = new Date(Date.now() - RL_REISSUE_WINDOW_MS);
      const reissues = await db.telegramAuthAttempt.count({
        where: { telegramId, kind: "reissue", createdAt: { gt: reissueSince } },
      });
      if (reissues >= RL_MAX_REISSUE) {
        throw new SafeLinkError("Слишком часто запрашиваете новый пароль. Попробуйте через час.");
      }
    }
  }

  async function recordAttempt(telegramId: string, kind: string, ok: boolean) {
    try {
      await db.telegramAuthAttempt.create({ data: { telegramId, kind, ok } });
    } catch {
    }
  }

  async function issueForEmployee(
    employee: EmpRow,
    telegramId: string,
    via: string,
    opts: { allowRelink: boolean },
  ): Promise<LinkResult> {
    if (!employee.isActive || employee.status === "TERMINATED") {
      throw new SafeLinkError("Учётная запись сотрудника неактивна. Напишите администратору.");
    }
    let user = await db.user.findUnique({ where: { employeeId: employee.id } });
    if (!user) {
      const existingUsers = await db.user.findMany({ select: { login: true } });
      const takenLogins = new Set(existingUsers.map((u) => u.login.toLowerCase()));
      const baseLogin = loginFromFullName(employee.fullName);
      const login = generateUniqueLogin(baseLogin, takenLogins);
      const passwordHash = await hashPassword(randomUUID());

      user = await db.user.create({
        data: {
          login,
          passwordHash,
          mustChangePassword: true,
          roles: ["EMPLOYEE"],
          employeeId: employee.id,
          isActive: true,
        },
      });

      await audit({
        actorId: user.id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
        newValue: { login: user.login, roles: user.roles, employeeId: employee.id, via: "telegram_auto" },
      });
    }
    if (!user.isActive) throw new SafeLinkError("Учётная запись отключена. Напишите администратору.");

    // Этот telegramId уже принадлежит другому сотруднику.
    // Если это активный сотрудник — блокируем.
    // Если привязка осталась на старой архивной записи — освобождаем её.
    const clash = await db.employee.findFirst({ where: { telegramId, NOT: { id: employee.id } } });
    if (clash) {
      if (clash.archivedAt) {
        await db.employee.update({ where: { id: clash.id }, data: { telegramId: null } });
      } else {
        throw new SafeLinkError("Этот Telegram уже привязан к другому сотруднику. Напишите администратору.");
      }
    }

    if (employee.telegramId && employee.telegramId !== telegramId && !opts.allowRelink) {
      throw new SafeLinkError(
        "Вы уже зарегистрированы в системе под другим Telegram-аккаунтом. Дублирование учётных записей запрещено. Для смены напишите администратору за кодом.",
      );
    }

    await db.employee.update({ where: { id: employee.id }, data: { telegramId } });
    const otp = await issueOtp(user.id, via);
    await audit({
      actorId: user.id,
      action: "TELEGRAM_LINKED",
      entityType: "Employee",
      entityId: employee.id,
      newValue: { via, relinked: Boolean(employee.telegramId && employee.telegramId !== telegramId) },
    });
    return { login: user.login, otp, fullName: employee.fullName };
  }

  async function linkByPhone(phone: string, telegramId: string): Promise<LinkResult> {
    await assertNotRateLimited(telegramId, "phone");
    let ok = false;
    try {
      if (!isTajikInternational(phone)) {
        throw new PhoneNotRecognizedError(
          "Не удалось выдать доступ по этому номеру. Если вы сотрудник — напишите администратору за кодом.",
        );
      }
      const norm = normalizePhone(phone);
      if (norm.length < 7) throw new PhoneNotRecognizedError("Не удалось распознать номер телефона.");

      // Ищем только среди действующих (не находящихся в архиве) сотрудников
      let match = await db.employee.findFirst({
        where: {
          archivedAt: null,
          OR: [
            { phoneNormalized: norm },
            { phoneSecondaryNormalized: norm },
          ],
        },
        select: EMP_SELECT,
      });
      if (!match) {
        const legacy = await db.employee.findMany({
          where: {
            archivedAt: null,
            OR: [
              { phone: { not: null }, phoneNormalized: null },
              { phoneSecondary: { not: null }, phoneSecondaryNormalized: null },
            ],
          },
          select: { ...EMP_SELECT, phone: true, phoneSecondary: true },
        });
        const hits = legacy.filter(
          (e) => (e.phone && normalizePhone(e.phone) === norm) ||
                 (e.phoneSecondary && normalizePhone(e.phoneSecondary) === norm),
        );
        if (hits.length === 1) {
          const updateData: { phoneNormalized?: string; phoneSecondaryNormalized?: string } = {};
          if (hits[0].phone && normalizePhone(hits[0].phone) === norm) {
            updateData.phoneNormalized = norm;
          } else if (hits[0].phoneSecondary && normalizePhone(hits[0].phoneSecondary) === norm) {
            updateData.phoneSecondaryNormalized = norm;
          }
          await db.employee.update({ where: { id: hits[0].id }, data: updateData });
          match = hits[0];
        } else if (hits.length > 1) {
          throw new PhoneNotRecognizedError(
            "По этому номеру несколько сотрудников. Напишите администратору за кодом идентификации.",
          );
        }
      }
      if (!match) {
        throw new PhoneNotRecognizedError(
          "Не удалось выдать доступ по этому номеру. Если вы сотрудник — напишите администратору за кодом.",
        );
      }
      try {
        const res = await issueForEmployee(match, telegramId, "telegram:phone", { allowRelink: false });
        ok = true;
        return res;
      } catch (e) {
        if (
          e instanceof SafeLinkError &&
          /напишите администратору за кодом|привязан другой Telegram|уже зарегистрированы/i.test(e.message)
        ) {
          throw e;
        }
        if (e instanceof SafeLinkError) {
          throw new PhoneNotRecognizedError(
            "Не удалось выдать доступ по этому номеру. Если вы сотрудник — напишите администратору за кодом.",
          );
        }
        throw e;
      }
    } finally {
      await recordAttempt(telegramId, "phone", ok);
    }
  }

  async function linkByCode(rawCode: string, telegramId: string): Promise<LinkResult> {
    await assertNotRateLimited(telegramId, "code");
    let ok = false;
    try {
      const code = rawCode.trim().toUpperCase();
      const rec = await db.identificationCode.findUnique({ where: { code } });
      if (!rec || rec.usedAt) throw new SafeLinkError("Код недействителен или уже использован.");
      if (rec.expiresAt < new Date()) throw new SafeLinkError("Срок действия кода истёк. Напишите администратору за новым кодом.");

      const employee = await db.employee.findUnique({ where: { id: rec.employeeId }, select: EMP_SELECT });
      if (!employee) throw new SafeLinkError("Сотрудник не найден.");

      const result = await issueForEmployee(employee, telegramId, "telegram:code", { allowRelink: true });
      await db.identificationCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
      ok = true;
      return result;
    } finally {
      await recordAttempt(telegramId, "code", ok);
    }
  }

  async function verifyPhoneForCandidate(
    employeeId: string,
    phoneGuessRaw: string,
    telegramId: string,
  ): Promise<PhoneVerifyResult> {
    await assertNotRateLimited(telegramId, "phone");

    const guess = extractPhoneFromText(phoneGuessRaw);
    if (!guess) return { kind: "no_number" }; // не похоже на номер — попытку не считаем
    const guessNorm = normalizePhone(guess);

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { ...EMP_SELECT, phoneNormalized: true, phoneSecondaryNormalized: true, archivedAt: true },
    });
    if (!employee || employee.archivedAt) return { kind: "no_number" };

    const matches =
      (!!employee.phoneNormalized && employee.phoneNormalized === guessNorm) ||
      (!!employee.phoneSecondaryNormalized && employee.phoneSecondaryNormalized === guessNorm);

    let ok = false;
    try {
      if (!matches) return { kind: "wrong_number" };
      const res = await issueForEmployee(employee, telegramId, "telegram:selfreg", { allowRelink: false });
      ok = true;
      return { kind: "granted", result: res };
    } finally {
      await recordAttempt(telegramId, "phone", ok);
    }
  }

  async function reissueOtp(telegramId: string): Promise<LinkResult> {
    await assertNotRateLimited(telegramId, "reissue");
    let ok = false;
    try {
      let employee = await db.employee.findFirst({
        where: { telegramId, archivedAt: null },
        select: EMP_SELECT,
      });
      if (!employee) {
        // Проверяем: возможно, старая запись сотрудника была отправлена в архив,
        // но есть действующая запись с тем же подтверждённым номером.
        const archived = await db.employee.findFirst({
          where: { telegramId, archivedAt: { not: null } },
        });
        if (archived?.phoneNormalized) {
          const active = await db.employee.findFirst({
            where: {
              archivedAt: null,
              OR: [
                { phoneNormalized: archived.phoneNormalized },
                { phoneSecondaryNormalized: archived.phoneNormalized },
              ],
            },
            select: EMP_SELECT,
          });
          if (active) {
            await db.employee.update({ where: { id: archived.id }, data: { telegramId: null } });
            employee = active;
          }
        }
      }
      if (employee) {
        const res = await issueForEmployee(employee, telegramId, "telegram:reissue", { allowRelink: true });
        ok = true;
        return res;
      }

      const serviceUser = await db.user.findFirst({
        where: { telegramId, employeeId: null },
        select: { id: true, login: true, isActive: true, partner: { select: { name: true } } },
      });
      if (serviceUser) {
        if (!serviceUser.isActive) throw new SafeLinkError("Учётная запись отключена. Напишите администратору.");
        const otp = await issueOtp(serviceUser.id, "telegram:reissue");
        await audit({
          actorId: serviceUser.id,
          action: "TELEGRAM_LINKED",
          entityType: "User",
          entityId: serviceUser.id,
          newValue: { via: "telegram:reissue", relinked: false },
        });
        ok = true;
        return { login: serviceUser.login, otp, fullName: serviceUser.partner?.name ?? serviceUser.login };
      }

      throw new SafeLinkError("Этот Telegram не привязан. Поделитесь контактом или напишите администратору за кодом.");
    } finally {
      await recordAttempt(telegramId, "reissue", ok);
    }
  }

  return { linkByPhone, linkByCode, verifyPhoneForCandidate, reissueOtp };
}
