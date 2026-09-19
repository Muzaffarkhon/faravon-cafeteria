import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Привязка телефона кассы без пароля.
 *
 * Админ создаёт одноразовую ссылку для учётки подрядчика; подрядчик один раз открывает её на
 * своём телефоне и нажимает «Привязать» — телефон получает обычную (долгую) сессию подрядчика.
 * Дальше QR сотрудника, отсканированный обычной камерой, открывает кассу уже без входа.
 *
 * Меры защиты:
 *  • токен — 256 бит случайности, в БД только его SHA-256 (утечка БД не даёт рабочих ссылок);
 *  • ссылка одноразовая и живёт 24 часа; новая ссылка гасит прежние неиспользованные;
 *  • только для учёток, у которых РОВНО роль CONTRACTOR и привязан партнёр — ссылкой нельзя
 *    войти в учётку администратора;
 *  • открытие ссылки (GET) токен не тратит — иначе предпросмотр в мессенджере «съел» бы её;
 *    списывает его только явное нажатие (атомарно: гонка двух нажатий пропустит одно);
 *  • отзыв: «Пароль» у учётки поднимает sessionEpoch и разлогинивает все привязанные телефоны.
 */

export const LINK_TTL_HOURS = 24;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Учётка, в которую разрешено входить по ссылке: активный подрядчик (только эта роль) с партнёром. */
function eligible(u: { isActive: boolean; roles: Role[]; partnerId: string | null } | null): boolean {
  return !!u && u.isActive && u.roles.length === 1 && u.roles[0] === "CONTRACTOR" && !!u.partnerId;
}

export type CreateLinkResult = { ok: true; token: string; expiresAt: Date; partnerName: string } | { ok: false; error: string };

export async function createCashierLink(userId: string, actorId: string): Promise<CreateLinkResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isActive: true, roles: true, partnerId: true, partner: { select: { name: true } } },
  });
  if (!user) return { ok: false, error: "Учётная запись не найдена." };
  if (!user.isActive) return { ok: false, error: "Учётная запись отключена." };
  if (!(user.roles.length === 1 && user.roles[0] === "CONTRACTOR")) {
    return { ok: false, error: "Ссылка доступна только для учёток подрядчика (без других ролей)." };
  }
  if (!user.partnerId) return { ok: false, error: "Сначала выберите партнёра для этой учётки." };

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_TTL_HOURS * 3600_000);
  await db.$transaction([
    // Прежние неиспользованные ссылки этой учётки гасим — одновременно живёт одна.
    db.cashierLink.deleteMany({ where: { userId, usedAt: null } }),
    db.cashierLink.create({ data: { userId, tokenHash: sha256(token), expiresAt, createdBy: actorId } }),
  ]);
  return { ok: true, token, expiresAt, partnerName: user.partner?.name ?? "" };
}

/** Проверка ссылки БЕЗ списания — для страницы подтверждения. */
export async function peekCashierLink(token: string): Promise<{ partnerName: string; login: string } | null> {
  if (!token || token.length > 128) return null;
  const link = await db.cashierLink.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { isActive: true, roles: true, partnerId: true, login: true, partner: { select: { name: true } } } } },
  });
  if (!link || link.usedAt || link.expiresAt <= new Date() || !eligible(link.user)) return null;
  return { partnerName: link.user.partner?.name ?? "", login: link.user.login };
}

export type UseLinkResult =
  | { ok: true; user: { id: string; login: string; roles: Role[]; employeeId: string | null; sessionEpoch: number } }
  | { ok: false };

/** Списывает ссылку (атомарно, один раз) и отдаёт учётку для создания сессии. */
export async function consumeCashierLink(token: string, meta: { ip: string; userAgent: string | null }): Promise<UseLinkResult> {
  if (!token || token.length > 128) return { ok: false };
  const tokenHash = sha256(token);
  const link = await db.cashierLink.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, login: true, roles: true, employeeId: true, sessionEpoch: true, isActive: true, partnerId: true } } },
  });
  if (!link || !eligible(link.user)) return { ok: false };

  // Условие в самом UPDATE: «ещё не использована и не истекла». Две одновременные попытки → одна выиграет.
  const won = await db.cashierLink.updateMany({
    where: { id: link.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date(), usedIp: meta.ip, usedAgent: meta.userAgent },
  });
  if (won.count !== 1) return { ok: false };

  const u = link.user;
  return { ok: true, user: { id: u.id, login: u.login, roles: u.roles, employeeId: u.employeeId, sessionEpoch: u.sessionEpoch } };
}
