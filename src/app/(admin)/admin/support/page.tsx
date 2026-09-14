import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { fetchThreadRows, type ThreadListSearchParams } from "./_thread-list-data";
import { ThreadList } from "./_thread-list";
import { SupportSplitShell } from "./_split-shell";

export const dynamic = "force-dynamic";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<ThreadListSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage") && !can(session.roles, "feedback.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const sp = await searchParams;
  const { rows } = await fetchThreadRows(sp);
  const total = await db.supportThread.count();

  return (
    <div data-wide>
      <SupportSplitShell
        showSidebarOnMobile
        sidebar={<ThreadList rows={rows} basePath="/admin/support" sp={sp} locale={locale} />}
        content={
          <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
            <p className="text-sm font-semibold text-ink">{t("support.pickThread")}</p>
            {total === 0 && <p className="text-xs text-ink-muted">{t("support.empty")}</p>}
          </div>
        }
      />
    </div>
  );
}
