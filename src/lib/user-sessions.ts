import "server-only";

/** Порог "онлайн сейчас" — используется и страницей /admin/sessions, и SSE-сигнатурой /api/stream. */
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;

/** Prisma-условие "сессия сейчас активна" — единое место, чтобы страница и live-сигнатура не разъехались. */
export function onlineSessionWhere() {
  return {
    revokedAt: null,
    lastSeenAt: { gt: new Date(Date.now() - ONLINE_WINDOW_MS) },
  } as const;
}
