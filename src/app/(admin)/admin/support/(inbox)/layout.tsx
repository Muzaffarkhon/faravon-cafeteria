import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale } from "@/lib/i18n";
import { SupportSplitShell } from "../_split-shell";
import { ThreadListLive } from "../_thread-list-live";

/**
 * Общий layout для списка диалогов (`/admin/support`) и открытого диалога
 * (`/admin/support/<id>`) — боковая панель рендерится один раз здесь и
 * остаётся смонтированной при переходе между диалогами, поэтому переключение
 * ощущается как в мессенджере (меняется только правая панель), а не как
 * переход на отдельную страницу. `faq`/`quick-replies` — соседние роуты вне
 * этой группы, их эта раскладка не затрагивает.
 */
export default async function SupportInboxLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage") && !can(session.roles, "feedback.manage")) redirect("/");
  const locale = await getLocale();

  return (
    <div data-wide>
      <SupportSplitShell sidebar={<ThreadListLive locale={locale} />} content={children} />
    </div>
  );
}
