import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { extractPhoneFromText } from "@/lib/phone";
import { getTranslator } from "@/lib/i18n";
import { findEmployeeForLink } from "@/app/(admin)/admin/support/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Данные одного диалога для клиентской панели (`_thread-view-live.tsx`) — та
 * же выборка, что раньше рендерилась на сервере внутри `[id]/page.tsx`, но
 * теперь панель сама опрашивает диалог по клику, поэтому переход между
 * чатами не ждёт серверный рендер (нет заметной загрузки при смене чата).
 */
function detectGuestPhone(messages: { direction: "IN" | "OUT"; body: string }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.direction !== "IN") continue;
    const phone = extractPhoneFromText(m.body);
    if (phone) return phone;
  }
  return null;
}

// Слово ФИО: заглавная (в т.ч. таджикская) буква + строчные, с необязательным
// дефисным продолжением («Абдурахим-заде»).
const NAME_WORD = /^[А-ЯЁӢӮҲҶҒҚ][а-яёӣӯҳҷғқ]+(-[А-ЯЁӢӮҲҶҒҚ]?[а-яёӣӯҳҷғқ]+)?$/;

/** true, если текст похож на «Фамилия Имя [Отчество]», а не на обычную реплику. */
function looksLikeFullName(text: string): boolean {
  const t = text.trim();
  if (!t || t.startsWith("[") || /\d/.test(t)) return false;
  const words = t.split(/\s+/);
  return words.length >= 2 && words.length <= 4 && words.every((w) => NAME_WORD.test(w));
}

/** Просят прислать ФИО (см. api/telegram/route.ts) — гость обычно отвечает на это. */
function detectGuestName(messages: { direction: "IN" | "OUT"; body: string }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.direction !== "IN") continue;
    if (looksLikeFullName(m.body)) return m.body.trim();
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (!can(session.roles, "support.manage") && !can(session.roles, "feedback.manage"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const t = await getTranslator();

  const thread = await db.supportThread.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, fullName: true, position: true, department: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { login: true, employee: { select: { fullName: true } } } },
          replyTo: { select: { id: true, direction: true, body: true } },
        },
      },
    },
  });
  if (!thread) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const quickReplies = await db.supportQuickReply.findMany({ orderBy: { createdAt: "asc" } });
  const baseView = {
    threadId: thread.id,
    status: thread.status,
    source: thread.source,
    archived: !!thread.archivedAt,
    messages: thread.messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      author: m.author?.employee?.fullName ?? m.author?.login ?? null,
      replyTo: m.replyTo ? { id: m.replyTo.id, direction: m.replyTo.direction, body: m.replyTo.body } : null,
    })),
    quickReplies: quickReplies.map((r) => ({ id: r.id, text: r.text })),
  };

  if (thread.source === "WEB") {
    return NextResponse.json({
      ...baseView,
      identityTitle: thread.employee?.fullName ?? t("support.employee"),
      identitySubtitle: thread.employee
        ? `${thread.employee.position} · ${thread.employee.department}${thread.topic ? ` · ${thread.topic}` : ""}`
        : (thread.topic ?? ""),
      guestPhone: null,
      guestNameGuess: null,
      alreadyLinked: true,
      initialMatches: [],
    });
  }

  const linkedEmployee = thread.telegramId
    ? await db.employee.findFirst({
        where: { telegramId: thread.telegramId },
        select: { id: true, fullName: true, position: true, department: true },
      })
    : null;

  const guestPhone = thread.phone ?? detectGuestPhone(thread.messages);
  const guestNameGuess = linkedEmployee ? null : detectGuestName(thread.messages);
  let initialMatches =
    !linkedEmployee && guestPhone ? (await findEmployeeForLink(guestPhone)).matches ?? [] : [];
  // Номер не нашёл совпадений (или его не было) — пробуем по ФИО, которое
  // гость прислал в ответ на просьбу представиться (см. api/telegram/route.ts).
  if (!linkedEmployee && guestNameGuess && initialMatches.length === 0) {
    initialMatches = (await findEmployeeForLink(guestNameGuess)).matches ?? [];
  }

  const identityTitle = linkedEmployee ? linkedEmployee.fullName : `${t("support.guestPrefix")}${thread.seq}`;
  const identitySubtitle = linkedEmployee
    ? `${linkedEmployee.position} · ${linkedEmployee.department} · ${t("support.guestPrefix")}${thread.seq}`
    : guestPhone
      ? `${t("support.phoneSentPrefix")} ${guestPhone}`
      : t("support.phoneUnknown");

  return NextResponse.json({
    ...baseView,
    identityTitle,
    identitySubtitle,
    guestPhone,
    guestNameGuess,
    alreadyLinked: !!linkedEmployee,
    initialMatches,
  });
}
