import "server-only";
import { db } from "@/lib/db";
import { fuzzyNameKey } from "@/lib/translit";
import { verifyPhoneForCandidate, type LinkResult } from "@/lib/telegram-link";

/**
 * Авторегистрация в Telegram-боте: гость поделился контактом, номер не
 * нашёлся (`openContactSupportThread` в route.ts проставляет `phone` на
 * треде — это и есть маркер «идёт авторегистрация»). Дальше бот сам
 * пытается найти сотрудника по присланному тексту (ФИО, должность,
 * подразделение — в одном сообщении или в нескольких) и, если нашёл ровно
 * одного, просит подтвердить номером телефона из системы, не называя его.
 *
 * Только webhook-путь (route.ts). Polling-бот (bot/bot.ts + bot/link.ts)
 * этой логикой пока не пользуется — см. план фичи.
 */

const MAX_PHONE_ATTEMPTS = 3;

export type SelfRegAction =
  | { kind: "none" } // не наша ветка — тред без активной авторегистрации
  | { kind: "ambiguous" } // несколько похожих ФИО — просим уточнить
  | { kind: "ask_phone"; fullName: string } // кандидат найден — просим номер
  | { kind: "phone_wrong"; attemptsLeft: number }
  | { kind: "phone_exhausted" }
  | { kind: "granted"; result: LinkResult };

const CONTACT_MARKER_PREFIX = "[Поделился контактом]";

type Candidate = {
  id: string;
  fullName: string;
  department: string;
  position: string;
};

/** Все входящие сообщения треда после отметки о контакте, одной строкой. */
async function guestTextSinceContact(threadId: string): Promise<string> {
  const messages = await db.supportMessage.findMany({
    where: { threadId, direction: "IN" },
    orderBy: { createdAt: "asc" },
    select: { body: true },
  });
  return messages
    .map((m) => m.body)
    .filter((b) => !b.startsWith(CONTACT_MARKER_PREFIX))
    .join(" ");
}

async function findNameCandidates(blob: string): Promise<Candidate[]> {
  const key = fuzzyNameKey(blob);
  if (key.length < 4) return []; // слишком коротко, чтобы что-то значить

  const pool = await db.employee.findMany({
    where: { archivedAt: null, telegramId: null },
    select: { id: true, fullName: true, department: true, position: true },
  });
  return pool.filter((e) => key.includes(fuzzyNameKey(e.fullName)));
}

function narrowByDepartmentPosition(candidates: Candidate[], blob: string): Candidate[] {
  const key = fuzzyNameKey(blob);
  const narrowed = candidates.filter(
    (c) => key.includes(fuzzyNameKey(c.department)) || key.includes(fuzzyNameKey(c.position)),
  );
  return narrowed.length > 0 ? narrowed : candidates;
}

/**
 * Обрабатывает очередное текстовое сообщение гостя в треде авторегистрации.
 * `text` — только что присланное сообщение (уже сохранено в тред вызывающим
 * кодом через appendGuestMessage). Ничего не отправляет в Telegram сама —
 * route.ts переводит результат в конкретные send(...).
 */
export async function resolveSelfRegistrationStep(telegramId: string, text: string): Promise<SelfRegAction> {
  const thread = await db.supportThread.findUnique({ where: { telegramId } });
  if (!thread || !thread.phone) return { kind: "none" };

  if (thread.regCandidateEmployeeId) {
    const candidateId = thread.regCandidateEmployeeId;
    // SafeLinkError (рейт-лимит, проблема учётки) всплывает наружу как есть —
    // route.ts уже умеет показывать её текст.
    const verified = await verifyPhoneForCandidate(candidateId, text, telegramId);

    if (verified.kind === "granted") {
      await db.supportThread.update({
        where: { id: thread.id },
        data: { phone: null, regCandidateEmployeeId: null, regPhoneAttempts: 0, status: "CLOSED" },
      });
      return { kind: "granted", result: verified.result };
    }

    // Номер не распознан в тексте вовсе — не тратим попытку, просто напоминаем.
    if (verified.kind === "no_number") {
      const candidate = await db.employee.findUnique({ where: { id: candidateId }, select: { fullName: true } });
      return { kind: "ask_phone", fullName: candidate?.fullName ?? "" };
    }

    const attempts = thread.regPhoneAttempts + 1;
    if (attempts >= MAX_PHONE_ATTEMPTS) {
      await db.supportThread.update({
        where: { id: thread.id },
        data: { regCandidateEmployeeId: null, regPhoneAttempts: 0 },
      });
      return { kind: "phone_exhausted" };
    }
    await db.supportThread.update({ where: { id: thread.id }, data: { regPhoneAttempts: attempts } });
    return { kind: "phone_wrong", attemptsLeft: MAX_PHONE_ATTEMPTS - attempts };
  }

  const blob = await guestTextSinceContact(thread.id);
  let candidates = await findNameCandidates(blob);
  if (candidates.length > 1) candidates = narrowByDepartmentPosition(candidates, blob);

  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length > 1) return { kind: "ambiguous" };

  await db.supportThread.update({
    where: { id: thread.id },
    data: { regCandidateEmployeeId: candidates[0].id, regPhoneAttempts: 0 },
  });
  return { kind: "ask_phone", fullName: candidates[0].fullName };
}
