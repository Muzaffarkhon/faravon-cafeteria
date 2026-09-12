import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { ensureRbac } from "@/lib/rbac-load";
import { PetalDrift } from "@/components/petals";
import { PetalDrag } from "@/components/petal-drag";
import { resolveSelectionContext, getApplicationWithItems } from "@/lib/selection";
import { AppShell } from "./_shell";
import { AdminShell } from "@/app/(admin)/_shell";
import { SupportAlert } from "./_support-alert";
import { buildNavGroups } from "./_nav";
import { computeNavBadges } from "./_badges";
import { getAdminNav } from "./_admin-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  await ensureRbac(); // подтянуть матрицу прав из БД перед проверками can()

  const { roles } = session;
  const canManageSupport = can(roles, "support.manage");
  const roleLabel = roles.map((r) => ROLE_LABELS[r]).join(", ");

  // Имя рядом с кнопкой профиля: «Фамилия И.» у сотрудника, иначе — логин.
  const displayName = (() => {
    if (session.employee?.fullName) {
      const parts = session.employee.fullName.trim().split(/\s+/);
      const surname = parts[0] ?? "";
      const initial = parts[1]?.[0];
      return initial ? `${surname} ${initial}.` : surname;
    }
    return session.user.login;
  })();

  // Служебная учётка (C&B и т.п.) без карточки сотрудника, с доступом в
  // админку — для неё ВСЕ страницы (включая «Работу») открываются в
  // AdminShell, а не только /admin/* (см. (admin)/layout.tsx — тот же шелл
  // для физически вложенных туда страниц). У сотрудников с доступом в
  // админку обычный «Кабинет» остаётся как есть — они просто получают
  // ссылку «Админ-панель» в меню профиля (ниже).
  if (!session.employee) {
    const { groups, hasAdminAccess } = await getAdminNav(session);
    if (hasAdminAccess) {
      return (
        <>
          {canManageSupport && <SupportAlert />}
          <AdminShell groups={groups} roleLabel={roleLabel} displayName={displayName}>
            {children}
          </AdminShell>
        </>
      );
    }
  }

  const canBroadcastPromo = can(roles, "promo.broadcast");
  const partnerId = session.user.partnerId;
  const partner = partnerId
    ? await db.partner.findUnique({ where: { id: partnerId }, select: { deliveryMode: true } })
    : null;
  const isTaxiContractor = canBroadcastPromo && !!partnerId && partner?.deliveryMode === "PHONE_PROMO";

  const badges = await computeNavBadges({
    roles,
    employeeId: session.employee?.id,
    partnerId,
  });

  // Счётчики выбора льгот — в закреплённой шапке (перенесены из «Витрины заботы»).
  let selectionStat: { used: number; drafts: number; max: number } | null = null;
  if (session.employee) {
    const sctx = await resolveSelectionContext();
    if (sctx.targetPeriod) {
      const appw = await getApplicationWithItems(session.employee.id, sctx.targetPeriod.id);
      const its = appw?.items ?? [];
      selectionStat = {
        used: its.filter((i) => !["CANCELLED", "REJECTED"].includes(i.status)).length,
        drafts: its.filter((i) => i.status === "DRAFT").length,
        max: sctx.targetPeriod.maxSelections,
      };
    }
  }

  const allGroups = buildNavGroups({
    roles,
    hasEmployee: !!session.employee,
    partnerId,
    isTaxiContractor,
    badges,
  });
  // «Каталог» и «Аналитика и доступ» переехали в отдельную админ-панель
  // (/admin) со своим левым меню — здесь остаются только «Кабинет»/«Работа».
  const groups = allGroups.filter((g) => g.id === "cabinet" || g.id === "work");
  const hasAdminAccess = allGroups.some(
    (g) => (g.id === "catalog" || g.id === "admin") && g.items.length > 0,
  );

  return (
    <>
      {canManageSupport && <SupportAlert />}
      <AppShell
        groups={groups}
        roleLabel={roleLabel}
        displayName={displayName}
        selectionStat={selectionStat}
        adminHref={hasAdminAccess ? "/admin" : undefined}
        backdrop={
          <>
            <PetalDrift fixed />
            <PetalDrag />
          </>
        }
      >
        {children}
      </AppShell>
    </>
  );
}
