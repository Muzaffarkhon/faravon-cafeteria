import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { ensureRbac } from "@/lib/rbac-load";
import { getAdminNav } from "@/app/(app)/_admin-nav";
import { SupportAlert } from "@/app/(app)/_support-alert";
import { AdminShell } from "./_shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  await ensureRbac();

  const { roles } = session;
  // Учётки с доступом в админку получают весь набор инструментов здесь —
  // «Работа» (Согласование, Купоны и т.п.) в том числе, а не отдельно в
  // обычной шапке (см. (app)/layout.tsx: для них она рендерит этот же шелл).
  const { groups, hasAdminAccess } = await getAdminNav(session);
  if (!hasAdminAccess) redirect("/");

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
