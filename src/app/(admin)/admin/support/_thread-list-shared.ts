import type { SupportThreadStatus } from "@prisma/client";

/**
 * Типы и константы списка диалогов, безопасные для клиентского бандла —
 * отдельно от `_thread-list-data.ts` (`server-only`, трогает `db`), которую
 * теперь импортирует и клиентский `_thread-list-live.tsx`.
 */

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
