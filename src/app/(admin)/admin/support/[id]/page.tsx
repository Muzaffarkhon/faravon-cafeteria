import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { extractPhoneFromText } from "@/lib/phone";
import { ThreadView } from "./_thread-view";
import { findEmployeeForLink } from "../actions";

/**
 * Номер телефона `SupportThread.phone` заполняется, только если гость
 * поделился Telegram-контактом — если он просто написал номер текстом, поле
 * остаётся пустым. Ищем такой номер среди входящих сообщений (от новых
 * к старым), чтобы «Сохранить номер» знал, что писать в карточку сотрудника.
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

export const dynamic = "force-dynamic";

export default async function SupportThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage")) redirect("/");

  const { id } = await params;
  const thread = await db.supportThread.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { login: true, employee: { select: { fullName: true } } } } },
      },
    },
  });
  if (!thread) notFound();

  // Гость уже опознан как сотрудник (обычная привязка через бота) — карточку
  // искать/привязывать заново не нужно.
  const linkedEmployee = await db.employee.findFirst({
    where: { telegramId: thread.telegramId },
    select: { id: true, fullName: true, position: true, department: true },
  });

  const guestPhone = thread.phone ?? detectGuestPhone(thread.messages);
  const initialMatches =
    !linkedEmployee && guestPhone ? (await findEmployeeForLink(guestPhone)).matches ?? [] : [];

  const quickReplies = await db.supportQuickReply.findMany({ orderBy: { createdAt: "asc" } });

  const identityTitle = linkedEmployee ? linkedEmployee.fullName : `Гость №${thread.seq}`;
  const identitySubtitle = linkedEmployee
    ? `${linkedEmployee.position} · ${linkedEmployee.department} · Гость №${thread.seq}`
    : guestPhone
      ? `Присылал номер: ${guestPhone}`
      : "Номер телефона неизвестен.";

  return (
    <ThreadView
      threadId={thread.id}
      status={thread.status}
      identityTitle={identityTitle}
      identitySubtitle={identitySubtitle}
      messages={thread.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        author: m.author?.employee?.fullName ?? m.author?.login ?? null,
      }))}
      guestPhone={guestPhone}
      alreadyLinked={!!linkedEmployee}
      initialMatches={initialMatches}
      quickReplies={quickReplies.map((r) => ({ id: r.id, text: r.text }))}
    />
  );
}
