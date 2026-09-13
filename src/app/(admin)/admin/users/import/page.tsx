import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { getLocale, getTranslator } from "@/lib/i18n";
import { ImportForm } from "./_form";

// Импорт большого справочника может идти дольше стандартных 15 с.
export const maxDuration = 60;

export default async function ImportUsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "users.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("users.import.title")}
        description={t("users.import.description")}
        action={
          // route handler, отдаёт файл — нужен обычный переход, не клиентская навигация
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/admin/users/import/template" className={buttonClass({ variant: "secondary", size: "sm" })}>
            {t("users.import.downloadTemplate")}
          </a>
        }
      />
      <Card className="p-5">
        <ImportForm locale={locale} />
      </Card>
    </div>
  );
}
