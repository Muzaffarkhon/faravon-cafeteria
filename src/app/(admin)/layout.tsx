import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { ensureRbac } from "@/lib/rbac-load";
import { getAdminNav } from "@/app/(app)/_admin-nav";
import { SupportAlert } from "@/app/(app)/_support-alert";
import { getLocale } from "@/lib/i18n";
import { AdminShell } from "./_shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  await ensureRbac();

  const { roles } = session;
  const { groups, hasAdminAccess } = await getAdminNav(session);
  if (!hasAdminAccess) redirect("/");
  const locale = await getLocale();

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
        locale={locale}
      >
        {children}
      </AdminShell>
    </>
  );
}
