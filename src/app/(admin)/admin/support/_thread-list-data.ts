import "server-only";
import type { Prisma, SupportThreadStatus } from "@prisma/client";
import { db } from "@/lib/db";

export const SUPPORT_STATUSES: SupportThreadStatus[] = ["OPEN", "CLOSED"];
export const SUPPORT_CHIP_PARAMS = ["status", "reply", "login", "unread", "archived"];

export type ThreadListSearchParams = {
  q?: string;
  status?: string;
  reply?: string;
  login?: string;
  unread?: string;
  archived?: string;
};

export type ThreadRow = {
  id: string;
  seq: number;
  source: "TELEGRAM" | "WEB";
  status: SupportThreadStatus;
  telegramId: string | null;
  employeeFullName: string | null;
  phone: string | null;
  topic: string | null;
  lastMessage: { direction: "IN" | "OUT"; body: string } | null;
  lastMessageAt: Date;
  unread: number;
  pendingReply: boolean;
  loginMissing: boolean;
  matchedInMessageOnly: boolean;
  archived: boolean;
};

/**
 * Общая выборка и фильтрация диалогов поддержки — используется и списком
 * (/admin/support), и боковой панелью внутри конкретного диалога
 * (/admin/support/[id]), чтобы обе показывали одно и то же под теми же
 * фильтрами/поиском из адреса страницы.
 */
export async function fetchThreadRows(sp: ThreadListSearchParams): Promise<{ rows: ThreadRow[]; q: string }> {
  const q = (sp.q ?? "").trim();
  const status = SUPPORT_STATUSES.find((s) => s === sp.status);
  const replyPending = sp.reply === "pending";
  const loginMissing = sp.login === "missing";
  const unreadOnly = sp.unread === "yes";
  const archivedOnly = sp.archived === "yes";

  const where: Prisma.SupportThreadWhereInput = {
    archivedAt: archivedOnly ? { not: null } : null,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { employee: { is: { fullName: { contains: q, mode: "insensitive" } } } },
            { phone: { contains: q, mode: "insensitive" } },
            { topic: { contains: q, mode: "insensitive" } },
            // «Поиск внутри чата» — ищем и по тексту переписки, не только по
            // тому, что видно в строке списка (имя/телефон/тема).
            { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [threads, linkedEmployees] = await Promise.all([
    db.supportThread.findMany({
      where,
      include: {
        employee: { select: { fullName: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: { where: { direction: "IN", readAt: null } } } },
      },
    }),
    // Тот же признак «гостю уже отправлен логин/пароль», что и на странице
    // диалога (alreadyLinked) — гость привязан, если его Telegram уже стоит
    // в карточке сотрудника.
    db.employee.findMany({ where: { telegramId: { not: null } }, select: { telegramId: true } }),
  ]);
  const linkedTelegramIds = new Set(linkedEmployees.map((e) => e.telegramId as string));
  const qLower = q.toLowerCase();

  let rows: ThreadRow[] = threads.map((th) => {
    const last = th.messages[0] as (typeof th.messages)[number] | undefined;
    const fullName = th.employee?.fullName ?? null;
    const matchedInMessageOnly =
      !!q &&
      !(fullName ?? "").toLowerCase().includes(qLower) &&
      !(th.phone ?? "").toLowerCase().includes(qLower) &&
      !(th.topic ?? "").toLowerCase().includes(qLower);
    return {
      id: th.id,
      seq: th.seq,
      source: th.source,
      status: th.status,
      telegramId: th.telegramId,
      employeeFullName: fullName,
      phone: th.phone,
      topic: th.topic,
      lastMessage: last ? { direction: last.direction, body: last.body } : null,
      lastMessageAt: th.lastMessageAt,
      unread: th._count.messages,
      pendingReply: last?.direction === "IN",
      loginMissing: th.source === "TELEGRAM" && !!th.telegramId && !linkedTelegramIds.has(th.telegramId),
      matchedInMessageOnly,
      archived: !!th.archivedAt,
    };
  });

  if (replyPending) rows = rows.filter((r) => r.pendingReply);
  if (loginMissing) rows = rows.filter((r) => r.loginMissing);
  if (unreadOnly) rows = rows.filter((r) => r.unread > 0);

  // Непрочитанные — наверх, дальше по свежести. Тредов немного, сортировка
  // в памяти проще и понятнее, чем городить это в orderBy.
  rows.sort((a, b) => {
    const unread = (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0);
    return unread !== 0 ? unread : b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
  });

  return { rows, q };
}
