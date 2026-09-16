"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/password";

const MAX_FAILED = 5; // §5.1 — блокировка конкретного аккаунта при 5 ошибках
const LOCK_MINUTES = 15;
const IP_WINDOW_MS = 15 * 60_000;
// Лимит по IP поднят до 300, чтобы 500 сотрудников из одного офиса (NAT/Wi-Fi) не блокировали друг друга.
// Персональная защита от перебора работает строго по аккаунту (MAX_FAILED = 5).
const IP_MAX_FAILED = 300;

// Фиктивный хэш (cost 12): сверяемся с ним, когда логина нет, чтобы время
// ответа не выдавало существование учётной записи (timing-атака / перебор логинов).
const DUMMY_HASH = "$2b$12$WMakJ6WuXA6D24/EiklcP.RTTq9Nhd/LwtFImI5s8zsr0H/RactTa";

export type LoginState = { error?: string };

async function clientMeta() {
  const h = await headers();
  // На Vercel `x-vercel-forwarded-for` проставляет платформа и его нельзя
  // подделать из запроса. У обычного `x-forwarded-for` доверять можно только
  // ПРАВОМУ элементу (ближайший к платформе хоп) — левый задаёт клиент, из-за
  // чего лимит перебора по IP раньше обходился сменой заголовка на каждый запрос.
  const vercel = h.get("x-vercel-forwarded-for")?.trim();
  const fwd = h.get("x-forwarded-for");
  const rightmost = fwd ? fwd.split(",").map((s) => s.trim()).filter(Boolean).pop() : undefined;
  const ip = vercel || rightmost || h.get("x-real-ip")?.trim() || "unknown";
  const userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  return { ip, userAgent };
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const login = String(formData.get("login") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  // Только внутренний путь: /path без протокол-относительного //, без \, без \n.
  // Иначе `redirect(next)` мог увести на внешний фишинг после успешного входа.
  const nextRaw = String(formData.get("next") ?? "/");
  const next = /^\/(?!\/)[^\s\\]*$/.test(nextRaw) ? nextRaw : "/";
  const honeypot = String(formData.get("company") ?? ""); // скрытое поле — заполняют только боты

  if (honeypot) return { error: "Неверный логин или пароль." };
  if (!login || !password) return { error: "Введите логин и пароль." };

  const { ip, userAgent } = await clientMeta();
  const genericError = { error: "Неверный логин или пароль." };

  // Лимит перебора по IP (§5.1). Окно отсчитываем от последнего УСПЕШНОГО входа
  // с этого адреса: за общим офисным NAT входят сотни сотрудников, и их опечатки
  // копились в один счётчик — в день запуска это заблокировало бы весь офис.
  // Перебор и «распыление» паролей успехом не заканчиваются, поэтому для
  // атакующего окно остаётся полным; счётчик по самому аккаунту (MAX_FAILED)
  // работает независимо от IP.
  const windowStart = new Date(Date.now() - IP_WINDOW_MS);
  const lastOk = await db.loginAttempt.findFirst({
    where: { ip, success: true, createdAt: { gt: windowStart } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const since = lastOk?.createdAt ?? windowStart;
  const ipFails = await db.loginAttempt.count({
    where: { ip, success: false, createdAt: { gt: since } },
  });
  if (ip !== "unknown" && ipFails >= IP_MAX_FAILED) {
    await db.loginAttempt.create({ data: { login, ip, userAgent, success: false } });
    return {
      error: "Слишком много попыток входа с вашего адреса. Повторите через 15 минут.",
    };
  }

  const fail = async (reason: string) => {
    await db.loginAttempt.create({ data: { login, ip, userAgent, success: false } });
    void reason;
    return genericError;
  };

  const user = await db.user.findUnique({ where: { login } });
  if (!user || !user.isActive) {
    await verifyPassword(password, DUMMY_HASH); // выравниваем время ответа (timing-атака / перебор логинов)
    return fail("no-user");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await db.loginAttempt.create({ data: { login, ip, userAgent, success: false } });
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    return { error: `Слишком много неверных попыток. Вход заблокирован ещё на ${minutesLeft} мин.` };
  }

  // Подрядчик — общий PIN на кассу партнёра: постоянный, без «смены пароля
  // при входе» и без срока годности (issueOtpForUser выдаёт его именно так).
  // Если роль назначили/сменили в обход выдачи нового пароля, старые
  // mustChangePassword/otpExpiresAt от прежней роли могли остаться в базе —
  // тогда эта проверка блокировала бы вход даже с верным паролем. Для
  // подрядчика она не применяется в принципе.
  const isContractorPin = user.roles.includes("CONTRACTOR");
  if (!isContractorPin && user.mustChangePassword && user.otpExpiresAt && user.otpExpiresAt < new Date()) {
    return { error: "Одноразовый код истёк. Запросите новый через Telegram-бот." };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const lockedNow = failed >= MAX_FAILED;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: lockedNow ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await db.loginAttempt.create({ data: { login, ip, userAgent, success: false } });
    await audit({ actorId: user.id, action: "LOGIN_FAILED", entityType: "User", entityId: user.id });
    // Именно на попытке, которая ставит блокировку, нужно предупредить сразу —
    // иначе сотрудник продолжает вводить верный пароль и видит generic-ошибку,
    // не понимая, что аккаунт уже заблокирован.
    if (lockedNow) {
      return { error: `Слишком много неверных попыток. Вход заблокирован ещё на ${LOCK_MINUTES} мин.` };
    }
    return genericError;
  }

  // Успех: сбрасываем счётчики, при слабом хеше — пере-хешируем (§5.1, cost ≥ 12).
  // Заодно приводим mustChangePassword/otpExpiresAt подрядчика к его
  // постоянному PIN-инварианту (см. isContractorPin выше) — если запись
  // была унаследована от прежней роли, дальше она уже не мешает.
  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(needsRehash(user.passwordHash)
        ? { passwordHash: await hashPassword(password) }
        : {}),
      ...(isContractorPin && (user.mustChangePassword || user.otpExpiresAt)
        ? { mustChangePassword: false, otpExpiresAt: null }
        : {}),
    },
  });
  await db.loginAttempt.create({ data: { login, ip, userAgent, success: true } });

  const effectiveMustChangePassword = isContractorPin ? false : user.mustChangePassword;
  await createSession({
    sub: user.id,
    login: user.login,
    roles: user.roles,
    employeeId: user.employeeId,
    mustChangePassword: effectiveMustChangePassword,
    epoch: user.sessionEpoch,
  });
  await audit({ actorId: user.id, action: "LOGIN_OK", entityType: "User", entityId: user.id });

  redirect(effectiveMustChangePassword ? "/change-password" : next);
}
