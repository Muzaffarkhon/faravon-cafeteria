import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { issueOtpForUser } from "@/lib/otp";
import { normalizePhone } from "@/lib/phone";
import { hashPassword } from "@/lib/password";
import { loginFromFullName, generateUniqueLogin } from "@/lib/translit";

/**
 * Идентификация сотрудника и выдача OTP — для webhook-роута Telegram-бота (§5.1).
 * Полинг-версия бота использует самодостаточный аналог в `bot/link.ts`
 * (правки безопасности должны вноситься в оба файла синхронно).
 */

export type LinkResult = { login: string; otp: string; fullName: string };

export { normalizePhone };

/**
 * Ошибка идентификации с «безопасным» текстом для пользователя. Всё, что не
 * SafeLinkError, наружу отдавать нельзя — только логировать (утечка внутренних
 * ошибок = оракул для перебора).
 */
export class SafeLinkError extends Error {}

// --- rate-limit (§5.1: защита от перебора номеров/кодов и генерации OTP) ---
const RL_WINDOW_MS = 15 * 60_000;
const RL_MAX_ATTEMPTS = 8; // всего попыток идентификации за окно на один telegramId
const RL_REISSUE_WINDOW_MS = 60 * 60_000;
const RL_MAX_REISSUE = 5; // /login (перевыпуск OTP) за час

async function assertNotRateLimited(telegramId: string, kind: "phone" | "code" | "reissue") {
  const since = new Date(Date.now() - RL_WINDOW_MS);
  const total = await db.telegramAuthAttempt.count({
    where: { telegramId, createdAt: { gt: since } },
  });
  if (total >= RL_MAX_ATTEMPTS) {
    throw new SafeLinkError("Слишком много попыток. Подождите 15 минут или обратитесь в HR.");
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
    /* журнал попыток не критичен — не роняем выдачу из-за него */
  }
}

async function issueForEmployee(
  employee: { id: string; fullName: string; isActive: boolean; status: string; telegramId: string | null },
  telegramId: string,
  via: string,
  opts: { allowRelink: boolean },
): Promise<LinkResult> {
  if (!employee.isActive || employee.status === "TERMINATED") {
    throw new SafeLinkError("Учётная запись сотрудника неактивна. Обратитесь в HR.");
  }
  let user = await db.user.findUnique({ where: { employeeId: employee.id } });
  if (!user) {
    // Автоматически заводим учётную запись для сотрудника, если HR ещё не создавал логин вручную
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
  if (!user.isActive) throw new SafeLinkError("Учётная запись отключена. Обратитесь в HR.");

  // Этот telegramId уже принадлежит другому сотруднику.
  // Если это активный сотрудник — блокируем.
  // Если привязка осталась на старой архивной записи — освобождаем её.
  const clash = await db.employee.findFirst({ where: { telegramId, NOT: { id: employee.id } } });
  if (clash) {
    if (clash.archivedAt) {
      await db.employee.update({ where: { id: clash.id }, data: { telegramId: null } });
    } else {
      throw new SafeLinkError("Этот Telegram уже привязан к другому сотруднику. Обратитесь в HR.");
    }
  }

  // У сотрудника уже есть привязка к ДРУГОМУ Telegram. Самостоятельная
  // перепривязка по номеру запрещена (иначе — захват аккаунта по номеру из
  // справочника). Перепривязку разрешает только код от HR (allowRelink).
  if (employee.telegramId && employee.telegramId !== telegramId && !opts.allowRelink) {
    throw new SafeLinkError(
      "Вы уже зарегистрированы в системе под другим Telegram-аккаунтом. Дублирование учётных записей запрещено. Для смены обратитесь в HR за кодом.",
    );
  }

  await db.employee.update({ where: { id: employee.id }, data: { telegramId } });
  // issueOtpForUser поднимает sessionEpoch → все прежние сессии этого
  // пользователя отзываются (защита, если аккаунт был скомпрометирован).
  const otp = await issueOtpForUser(user.id, via);
  await audit({
    actorId: user.id,
    action: "TELEGRAM_LINKED",
    entityType: "Employee",
    entityId: employee.id,
    newValue: { via, relinked: Boolean(employee.telegramId && employee.telegramId !== telegramId) },
  });
  return { login: user.login, otp, fullName: employee.fullName };
}

const EMP_SELECT = {
  id: true,
  fullName: true,
  isActive: true,
  status: true,
  telegramId: true,
} as const;

export async function linkByPhone(phone: string, telegramId: string): Promise<LinkResult> {
  await assertNotRateLimited(telegramId, "phone");
  let ok = false;
  try {
    const norm = normalizePhone(phone);
    if (norm.length < 7) throw new SafeLinkError("Не удалось распознать номер телефона.");

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
    // Фолбэк для записей, где phoneNormalized ещё не заполнен (созданы до бэкофилла).
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
        // неоднозначно — не рискуем привязать не того
        throw new SafeLinkError(
          "По этому номеру несколько сотрудников. Обратитесь в HR за кодом идентификации.",
        );
      }
    }
    // Единый ответ и для «не найдено», и для «неактивен» — чтобы бот не был
    // оракулом «этот номер есть в справочнике».
    if (!match) {
      throw new SafeLinkError(
        "Не удалось выдать доступ по этому номеру. Если вы сотрудник — обратитесь в HR за кодом.",
      );
    }
    try {
      const res = await issueForEmployee(match, telegramId, "telegram:phone", { allowRelink: false });
      ok = true;
      return res;
    } catch (e) {
      // Скрываем состояние учётки за общим текстом (см. выше), но «уже привязан
      // другой Telegram» оставляем — это подсказка легитимному пользователю.
      if (
        e instanceof SafeLinkError &&
        /обратитесь в HR за кодом|привязан другой Telegram|уже зарегистрированы/i.test(e.message)
      ) {
        throw e;
      }
      if (e instanceof SafeLinkError) {
        throw new SafeLinkError(
          "Не удалось выдать доступ по этому номеру. Если вы сотрудник — обратитесь в HR за кодом.",
        );
      }
      throw e;
    }
  } finally {
    await recordAttempt(telegramId, "phone", ok);
  }
}

export async function linkByCode(rawCode: string, telegramId: string): Promise<LinkResult> {
  await assertNotRateLimited(telegramId, "code");
  let ok = false;
  try {
    const code = rawCode.trim().toUpperCase();
    const rec = await db.identificationCode.findUnique({ where: { code } });
    if (!rec || rec.usedAt) throw new SafeLinkError("Код недействителен или уже использован.");
    if (rec.expiresAt < new Date()) throw new SafeLinkError("Срок действия кода истёк. Запросите новый у HR.");

    const employee = await db.employee.findUnique({ where: { id: rec.employeeId }, select: EMP_SELECT });
    if (!employee) throw new SafeLinkError("Сотрудник не найден.");

    // Код от HR = явная авторизация перепривязки.
    const result = await issueForEmployee(employee, telegramId, "telegram:code", { allowRelink: true });
    await db.identificationCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
    ok = true;
    return result;
  } finally {
    await recordAttempt(telegramId, "code", ok);
  }
}

export async function reissueOtp(telegramId: string): Promise<LinkResult> {
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

    // Служебная учётка (C&B, подрядчик) без карточки сотрудника — Telegram у нёй
    // привязан прямо к User.telegramId, а не к Employee, поэтому не находится
    // выше. Без этой ветки /login для таких аккаунтов всегда отвечал «не
    // привязан», хотя ровно этот Telegram и стоит в их профиле.
    const serviceUser = await db.user.findFirst({
      where: { telegramId, employeeId: null },
      select: { id: true, login: true, isActive: true, partner: { select: { name: true } } },
    });
    if (serviceUser) {
      if (!serviceUser.isActive) throw new SafeLinkError("Учётная запись отключена. Обратитесь в HR.");
      const otp = await issueOtpForUser(serviceUser.id, "telegram:reissue");
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

    throw new SafeLinkError("Этот Telegram не привязан. Поделитесь контактом или введите код от HR.");
  } finally {
    await recordAttempt(telegramId, "reissue", ok);
  }
}
