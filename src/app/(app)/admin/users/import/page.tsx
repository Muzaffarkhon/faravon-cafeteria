import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { ImportForm } from "./_form";

export default async function ImportUsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "users.manage")) redirect("/");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Импорт сотрудников из Excel"
        description="Загрузка справочника сотрудников из файла .xlsx. Сопоставление по табельному номеру: совпавшие записи обновляются, новые — создаются. Учётные записи для входа импорт не создаёт."
        action={
          // route handler, отдаёт файл — нужен обычный переход, не клиентская навигация
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/admin/users/import/template" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Скачать шаблон
          </a>
        }
      />
      <Card className="p-5">
        <ImportForm />
      </Card>
    </div>
  );
}
