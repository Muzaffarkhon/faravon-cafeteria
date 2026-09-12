import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { ensureRbac } from "@/lib/rbac-load";
import { buildNavGroups } from "@/app/(app)/_nav";
import { computeNavBadges } from "@/app/(app)/_badges";
import { SupportAlert } from "@/app/(app)/_support-alert";
import { AdminShell } from "./_shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  await ensureRbac();

  const { roles } = session;
  const badges = await computeNavBadges({ roles });

  const allGroups = buildNavGroups({
    roles,
    hasEmployee: false,
    partnerId: null,
    isTaxiContractor: false,
    badges,
  });
  // Левое меню админки — только «Каталог» и «Аналитика и доступ»; «Кабинет»/
  // «Работа» остаются в обычной шапке приложения.
  const groups = allGroups.filter((g) => g.id === "catalog" || g.id === "admin");
  if (groups.length === 0) redirect("/");

  const displayName = (() => {
    if (session.employee?.fullName) {
      const parts = session.employee.fullName.trim().split(/\s+/);
      const surname = parts[0] ?? "";
      const initial = parts[1]?.[0];
      return initial ? `${surname} ${initial}.` : surname;
    }
    return session.user.login;
  })();

  return (
    <>
      {can(roles, "support.manage") && <SupportAlert />}
      <AdminShell
        groups={groups}
        roleLabel={roles.map((r) => ROLE_LABELS[r]).join(", ")}
        displayName={displayName}
      >
        {children}
      </AdminShell>
    </>
  );
}
