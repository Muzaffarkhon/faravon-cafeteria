import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale } from "@/lib/i18n";
import { SupportInboxClient } from "./_support-inbox-client";

/**
 * Общий layout для списка диалогов (`/admin/support`) и открытого диалога
 * (`/admin/support/<id>`) — сам рендерится один раз, `[id]/page.tsx` больше
 * не используется для вывода (см. её комментарий). Переключение между
 * диалогами обрабатывает `SupportInboxClient` локальным состоянием, минуя
 * роутер Next.js: этот layout — асинхронный серверный компонент (проверяет
 * сессию), и раньше каждый клик по диалогу заставлял Next.js заново пройти
 * его на сервере, из-за чего на медленной сети список на миг пустел —
 * заметная «перезагрузка страницы» при переключении чатов.
 * `faq`/`quick-replies` — соседние роуты вне этой группы, их эта раскладка
 * не затрагивает.
 */
export default async function SupportInboxLayout() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage") && !can(session.roles, "feedback.manage")) redirect("/");
  const locale = await getLocale();

  return (
    <div data-wide>
      <SupportInboxClient locale={locale} />
    </div>
  );
}
