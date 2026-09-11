import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { ensureRbac } from "@/lib/rbac-load";
import { PetalDrift } from "@/components/petals";
import { PetalDrag } from "@/components/petal-drag";
import { resolveSelectionContext, getApplicationWithItems } from "@/lib/selection";
import { AppShell } from "./_shell";
import { buildNavGroups } from "./_nav";



export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  await ensureRbac(); // подтянуть матрицу прав из БД перед проверками can()

  const { roles } = session;
  const canDecide = can(roles, "applications.decide");
  const canManageCoupons = can(roles, "coupons.manage");
  const canManageCards = can(roles, "cards.manage");
  const canConfirmCoupons = can(roles, "coupons.confirm");
  const canManageFeedback = can(roles, "feedback.manage");
  const canBroadcastPromo = can(roles, "promo.broadcast");
  const partnerId = session.user.partnerId;
  const partner = partnerId
    ? await db.partner.findUnique({ where: { id: partnerId }, select: { deliveryMode: true } })
    : null;
  const isTaxiContractor = canBroadcastPromo && !!partnerId && partner?.deliveryMode === "PHONE_PROMO";

  const [
    pendingReview,
    pendingCoupons,
    pendingAdRequests,
    myCouponsReady,
    partnerCouponsReady,
    pendingFeedback,
  ] = await Promise.all([
    canDecide ? db.applicationItem.count({ where: { status: "PENDING" } }) : 0,
    canManageCoupons ? db.applicationItem.count({ where: { status: "APPROVED", coupon: null } }) : 0,
    canManageCards ? db.advertisingRequest.count({ where: { status: "PENDING" } }) : 0,
    session.employee
      ? db.coupon.count({ where: { employeeId: session.employee.id, status: "ISSUED" } })
      : 0,
    canConfirmCoupons && partnerId
      ? db.coupon.count({ where: { partnerId, status: "ISSUED" } })
      : 0,
    canManageFeedback ? db.feedback.count({ where: { status: "NEW" } }) : 0,
  ]);

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

  const groups = buildNavGroups({
    roles,
    hasEmployee: !!session.employee,
    partnerId,
    isTaxiContractor,
    badges: {
      review: pendingReview,
      coupons: pendingCoupons,
      adRequests: pendingAdRequests,
      myCoupons: myCouponsReady,
      partnerCoupons: partnerCouponsReady,
      feedback: pendingFeedback,
    },
  });

  return (
    <AppShell
      groups={groups}
      roleLabel={roles.map((r) => ROLE_LABELS[r]).join(", ")}
      displayName={displayName}
      selectionStat={selectionStat}
      backdrop={
        <>
          <PetalDrift fixed />
          <PetalDrag />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
