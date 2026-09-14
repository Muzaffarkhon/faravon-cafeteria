import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { extractPhoneFromText } from "@/lib/phone";
import { getLocale, getTranslator } from "@/lib/i18n";
import { fetchThreadRows, type ThreadListSearchParams } from "../_thread-list-data";
import { ThreadList } from "../_thread-list";
import { SupportSplitShell } from "../_split-shell";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ThreadListSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage") && !can(session.roles, "feedback.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const { id } = await params;
  const sp = await searchParams;
  const [thread, { rows }] = await Promise.all([
    db.supportThread.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, fullName: true, position: true, department: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { login: true, employee: { select: { fullName: true } } } } },
        },
      },
    }),
    fetchThreadRows(sp),
  ]);
  if (!thread) notFound();

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v);
  const listQueryString = qs.toString() ? `?${qs.toString()}` : "";

  const quickReplies = await db.supportQuickReply.findMany({ orderBy: { createdAt: "asc" } });
  const baseView = {
    threadId: thread.id,
    status: thread.status,
    source: thread.source,
    archived: !!thread.archivedAt,
    backHref: `/admin/support${listQueryString}`,
    messages: thread.messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      author: m.author?.employee?.fullName ?? m.author?.login ?? null,
    })),
    quickReplies: quickReplies.map((r) => ({ id: r.id, text: r.text })),
  };

  const sidebar = <ThreadList rows={rows} activeId={thread.id} basePath={`/admin/support/${id}`} sp={sp} locale={locale} />;

  if (thread.source === "WEB") {
    // Веб-обращение — личность сразу известна, кнопки привязки сотрудника не нужны.
    return (
      <div data-wide>
        <SupportSplitShell
          showSidebarOnMobile={false}
          sidebar={sidebar}
          content={
            <ThreadView
              {...baseView}
              identityTitle={thread.employee?.fullName ?? t("support.employee")}
              identitySubtitle={
                thread.employee
                  ? `${thread.employee.position} · ${thread.employee.department}${thread.topic ? ` · ${thread.topic}` : ""}`
                  : (thread.topic ?? "")
              }
              guestPhone={null}
              alreadyLinked
              initialMatches={[]}
              locale={locale}
            />
          }
        />
      </div>
    );
  }

  // Гость уже опознан как сотрудник (обычная привязка через бота) — карточку
  // искать/привязывать заново не нужно.
  const linkedEmployee = thread.telegramId
    ? await db.employee.findFirst({
        where: { telegramId: thread.telegramId },
        select: { id: true, fullName: true, position: true, department: true },
      })
    : null;

  const guestPhone = thread.phone ?? detectGuestPhone(thread.messages);
  const initialMatches =
    !linkedEmployee && guestPhone ? (await findEmployeeForLink(guestPhone)).matches ?? [] : [];

  const identityTitle = linkedEmployee ? linkedEmployee.fullName : `${t("support.guestPrefix")}${thread.seq}`;
  const identitySubtitle = linkedEmployee
    ? `${linkedEmployee.position} · ${linkedEmployee.department} · ${t("support.guestPrefix")}${thread.seq}`
    : guestPhone
      ? `${t("support.phoneSentPrefix")} ${guestPhone}`
      : t("support.phoneUnknown");

  return (
    <div data-wide>
      <SupportSplitShell
        showSidebarOnMobile={false}
        sidebar={sidebar}
        content={
          <ThreadView
            {...baseView}
            identityTitle={identityTitle}
            identitySubtitle={identitySubtitle}
            guestPhone={guestPhone}
            alreadyLinked={!!linkedEmployee}
            initialMatches={initialMatches}
            locale={locale}
          />
        }
      />
    </div>
  );
}
