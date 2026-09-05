import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { ensureRbac } from "@/lib/rbac-load";
import { PetalDrift } from "@/components/petals";
import { PetalDrag } from "@/components/petal-drag";
import { AppShell, type NavGroup, type NavItem } from "./_shell";

const ICONS = {
  overview: "M4 4h7v7H4z||M13 4h7v7h-7z||M4 13h7v7H4z||M13 13h7v7h-7z",
  applications: "M6 2h12v20l-3-2-3 2-3-2-3 2z||M9 8h6||M9 12h6",
  gamification: "M8 21h8||M12 17v4||M7 4h10v5a5 5 0 0 1-10 0z||M17 5h2a2 2 0 0 1 0 4h-2||M7 5H5a2 2 0 0 0 0 4h2",
  review: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z||M9 12l2 2 4-4",
  coupons: "M4 9V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z||M12 7v10",
  scan: "M3 7V5a2 2 0 0 1 2-2h2||M17 3h2a2 2 0 0 1 2 2v2||M21 17v2a2 2 0 0 1-2 2h-2||M7 21H5a2 2 0 0 1-2-2v-2||M7 12h10",
  ad: "M3 11l14-7v16L3 13z||M3 11v3||M17 8a3 3 0 0 1 0 8",
  cards: "M12 3l9 5-9 5-9-5z||M3 13l9 5 9-5||M3 17l9 5 9-5",
  partners: "M4 21h16||M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16||M9 8h1||M9 12h1||M14 8h1||M14 12h1",
  banners: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z||M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z||M21 15l-5-5L6 19",
  inbox: "M4 13h4l2 3h4l2-3h4||M4 13l2-7h12l2 7||M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5",
  texts: "M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z||M14 2v6h6||M8 13h8||M8 17h6",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9||M10.3 21a2 2 0 0 0 3.4 0",
  reports: "M4 20V10||M10 20V4||M16 20v-7||M2 20h20",
  sla: "M12 8v5l3 2||M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z||M9 3h6",
  periods: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z||M4 10h16||M8 3v4||M16 3v4",
  access: "M14 7a4 4 0 1 0-3.5 3.97L4 17v3h3l1-1h2v-2h2l1.5-1.5A4 4 0 0 0 14 7z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z||M3 21v-1a6 6 0 0 1 12 0v1||M17 11a3 3 0 1 0 0-6||M21 21v-1a5 5 0 0 0-4-4.9",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8||M3 3v5h5||M12 8v5l3 2",
};

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
  const partnerId = session.user.partnerId;

  const [pendingReview, pendingCoupons, pendingAdRequests, myCouponsReady, partnerCouponsReady] =
    await Promise.all([
      canDecide ? db.applicationItem.count({ where: { status: "PENDING" } }) : 0,
      canManageCoupons ? db.applicationItem.count({ where: { status: "APPROVED", coupon: null } }) : 0,
      canManageCards ? db.advertisingRequest.count({ where: { status: "PENDING" } }) : 0,
      session.employee
        ? db.coupon.count({ where: { employeeId: session.employee.id, status: "ISSUED" } })
        : 0,
      canConfirmCoupons && partnerId
        ? db.coupon.count({ where: { partnerId, status: "ISSUED" } })
        : 0,
    ]);

  const groups: NavGroup[] = [];
  const add = (gid: string, glabel: string, item: NavItem) => {
    let g = groups.find((x) => x.id === gid);
    if (!g) {
      g = { id: gid, label: glabel, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  };

  if (session.employee) {
    add("cabinet", "Кабинет", { href: "/", label: "Обзор", icon: ICONS.overview });
    add("cabinet", "Кабинет", {
      href: "/applications",
      label: "Мои заявки и купоны",
      icon: ICONS.applications,
      badge: myCouponsReady || undefined,
    });
    add("cabinet", "Кабинет", { href: "/gamification", label: "Геймификация", icon: ICONS.gamification, soon: true });
  }
  if (canDecide)
    add("work", "Работа", { href: "/review", label: "Согласование", icon: ICONS.review, badge: pendingReview || undefined });
  if (canManageCoupons)
    add("work", "Работа", { href: "/coupons", label: "Купоны", icon: ICONS.coupons, badge: pendingCoupons || undefined });
  if (canConfirmCoupons)
    add("work", "Работа", {
      href: "/provider",
      label: "Касса партнёра",
      icon: ICONS.scan,
      badge: partnerCouponsReady || undefined,
    });
  if (canConfirmCoupons && partnerId)
    add("work", "Работа", { href: "/advertising", label: "Реклама", icon: ICONS.ad });

  if (can(roles, "cards.manage"))
    add("catalog", "Каталог", { href: "/admin/cards", label: "Карточки", icon: ICONS.cards });
  if (can(roles, "partners.manage"))
    add("catalog", "Каталог", { href: "/admin/partners", label: "Партнёры", icon: ICONS.partners });
  if (can(roles, "partners.manage"))
    add("catalog", "Каталог", { href: "/admin/partner-banners", label: "Баннеры", icon: ICONS.banners });
  if (canManageCards)
    add("catalog", "Каталог", {
      href: "/admin/advertising-requests",
      label: "Заявки на рекламу",
      icon: ICONS.inbox,
      badge: pendingAdRequests || undefined,
    });
  if (can(roles, "cards.manage"))
    add("catalog", "Каталог", { href: "/admin/texts", label: "Тексты", icon: ICONS.texts });
  if (can(roles, "cards.manage"))
    add("catalog", "Каталог", { href: "/admin/notifications", label: "Уведомления", icon: ICONS.bell });

  if (can(roles, "reports.view"))
    add("admin", "Аналитика и доступ", { href: "/admin/reports", label: "Отчёты", icon: ICONS.reports });
  if (can(roles, "cards.manage"))
    add("admin", "Аналитика и доступ", { href: "/admin/sla", label: "SLA", icon: ICONS.sla });
  if (can(roles, "periods.manage"))
    add("admin", "Аналитика и доступ", { href: "/admin/periods", label: "Периоды", icon: ICONS.periods });
  if (can(roles, "access.manage"))
    add("admin", "Аналитика и доступ", { href: "/admin/access", label: "Доступ", icon: ICONS.access });
  if (can(roles, "users.manage"))
    add("admin", "Аналитика и доступ", { href: "/admin/users", label: "Пользователи", icon: ICONS.users });
  if (can(roles, "audit.view"))
    add("admin", "Аналитика и доступ", { href: "/admin/audit", label: "История", icon: ICONS.history });

  return (
    <AppShell
      groups={groups}
      roleLabel={roles.map((r) => ROLE_LABELS[r]).join(", ")}
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
