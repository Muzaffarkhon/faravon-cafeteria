import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { buildNavGroups } from "./_nav";
import { computeNavBadges } from "./_badges";
import type { NavGroup } from "./_shell";
import { getLocale } from "@/lib/i18n";

/**
 * Данные левого меню админ-панели («Работа»+«Каталог»+«Аналитика и доступ») —
 * общие для (app)/layout.tsx (решает, каким шеллом обернуть страницу) и
 * (admin)/layout.tsx (сам /admin). Один источник, чтобы порядок разделов и
 * условие «есть ли доступ в админку» не разошлись между двумя местами.
 */
export async function getAdminNav(session: {
  roles: Role[];
  user: { partnerId: string | null };
  employee?: { id: string } | null;
}): Promise<{ groups: NavGroup[]; hasAdminAccess: boolean }> {
  const { roles } = session;
  const partnerId = session.user.partnerId;
  const [partner, badges, locale] = await Promise.all([
    partnerId
      ? db.partner.findUnique({ where: { id: partnerId }, select: { deliveryMode: true } })
      : Promise.resolve(null),
    computeNavBadges({ roles, employeeId: session.employee?.id, partnerId }),
    getLocale(),
  ]);
  const isTaxiContractor =
    can(roles, "promo.broadcast") && !!partnerId && partner?.deliveryMode === "PHONE_PROMO";

  const allGroups = buildNavGroups({
    roles,
    hasEmployee: false,
    partnerId,
    isTaxiContractor,
    badges,
    locale,
  });
  const groups = allGroups.filter((g) => g.id === "work" || g.id === "catalog" || g.id === "admin");
  const hasAdminAccess = allGroups.some(
    (g) => (g.id === "catalog" || g.id === "admin") && g.items.length > 0,
  );
  return { groups, hasAdminAccess };
}
