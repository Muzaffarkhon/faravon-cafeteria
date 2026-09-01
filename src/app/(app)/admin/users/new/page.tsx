import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { createEmployee } from "../actions";
import { EmployeeForm } from "../_form";

export default async function NewUserPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "users.manage")) redirect("/");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Новый сотрудник"
        description="Добавьте сотрудника в справочник. При необходимости сразу создайте учётную запись для входа."
      />
      <EmployeeForm action={createEmployee} submitLabel="Добавить" withAccount />
    </div>
  );
}
