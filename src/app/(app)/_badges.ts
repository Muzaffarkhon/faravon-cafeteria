import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import type { NavBadges } from "./_nav";

/**
 * Считает «сколько чего ждёт» — одно место для двух поверхностей: меню
 * «Ещё» в шапке (`layout.tsx`) и плитки «Кабинета» у ролей без карточки
 * сотрудника (`page.tsx`). Раньше запрос жил только в layout.tsx, и
 * плитки его не видели вовсе — разошлись бы и дальше, если бы каждая
 * поверхность считала сама.
 */
export async function computeNavBadges(opts: {
  roles: Role[];
  employeeId?: string | null;
  partnerId?: string | null;
}): Promise<NavBadges> {
  const { roles, employeeId, partnerId } = opts;
  const canDecide = can(roles, "applications.decide");
  const canManageCoupons = can(roles, "coupons.manage");
  const canManageCards = can(roles, "cards.manage");
  const canConfirmCoupons = can(roles, "coupons.confirm");
  const canManageFeedback = can(roles, "feedback.manage");
  const canManageSupport = can(roles, "support.manage");

  const [review, coupons, adRequests, myCoupons, partnerCoupons, feedback, support] =
    await Promise.all([
      canDecide ? db.applicationItem.count({ where: { status: "PENDING" } }) : 0,
      canManageCoupons ? db.applicationItem.count({ where: { status: "APPROVED", coupon: null } }) : 0,
      canManageCards ? db.advertisingRequest.count({ where: { status: "PENDING" } }) : 0,
      employeeId ? db.coupon.count({ where: { employeeId, status: "ISSUED" } }) : 0,
      canConfirmCoupons && partnerId
        ? db.coupon.count({ where: { partnerId, status: "ISSUED" } })
        : 0,
      canManageFeedback ? db.feedback.count({ where: { status: "NEW" } }) : 0,
      canManageSupport
        ? db.supportThread.count({ where: { messages: { some: { direction: "IN", readAt: null } } } })
        : 0,
    ]);

  return {
    review,
    coupons,
    adRequests,
    myCoupons,
    partnerCoupons,
    feedback,
    support,
  };
}
