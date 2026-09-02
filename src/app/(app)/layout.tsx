import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { BrandLockup } from "@/components/brand";
import { PetalDrift } from "@/components/petals";
import { Button } from "@/components/ui";
import { logout } from "./actions";
import { AppNav, type NavItem } from "./_nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  const { roles } = session;
  const canDecide = can(roles, "applications.decide");
  const pendingReview = canDecide
    ? await db.applicationItem.count({ where: { status: "PENDING" } })
    : 0;

  const items: NavItem[] = [];
  if (session.employee) {
    items.push(
      { href: "/", label: "Обзор" },
      { href: "/applications", label: "Мои заявки и купоны" },
    );
  }
  if (canDecide)
    items.push({ href: "/review", label: "Согласование", badge: pendingReview || undefined });
  if (can(roles, "coupons.manage")) items.push({ href: "/coupons", label: "Купоны" });
  if (can(roles, "coupons.confirm")) items.push({ href: "/provider", label: "Погашение купонов" });
  if (can(roles, "coupons.confirm") && session.user.partnerId)
    items.push({ href: "/advertising", label: "Реклама" });
  if (can(roles, "cards.manage")) items.push({ href: "/admin/cards", label: "Карточки" });
  if (can(roles, "partners.manage")) items.push({ href: "/admin/partners", label: "Партнёры" });
  if (can(roles, "partners.manage")) items.push({ href: "/admin/partner-banners", label: "Баннеры" });
  if (can(roles, "cards.manage")) items.push({ href: "/admin/advertising-requests", label: "Заявки на рекламу" });
  if (can(roles, "cards.manage")) items.push({ href: "/admin/texts", label: "Тексты" });
  if (can(roles, "cards.manage")) items.push({ href: "/admin/notifications", label: "Уведомления" });
  if (can(roles, "cards.manage")) items.push({ href: "/admin/sla", label: "SLA" });
  if (can(roles, "periods.manage")) items.push({ href: "/admin/periods", label: "Периоды" });
  if (can(roles, "reports.view")) items.push({ href: "/admin/reports", label: "Отчёты" });
  if (can(roles, "access.manage")) items.push({ href: "/admin/access", label: "Доступ" });
  if (can(roles, "users.manage")) items.push({ href: "/admin/users", label: "Пользователи" });
  items.push({ href: "/profile", label: "Профиль" });

  return (
    <div className="relative isolate min-h-dvh bg-canvas text-ink">
      <PetalDrift fixed />
      <header
        className="sticky top-0 z-30 border-b border-line/80 bg-surface/80 backdrop-blur-xl"
        style={{ paddingTop: "max(env(safe-area-inset-top), var(--tg-top))" }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2">
          <BrandLockup markSize={26} />

          <div className="flex items-center gap-3">
            <AppNav items={items} />
            <div className="hidden items-center gap-2 rounded-full border border-line bg-surface-muted px-2.5 py-1 md:flex">
              <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                {roles.map((r) => ROLE_LABELS[r]).join(", ")}
              </span>
            </div>
            <form action={logout}>
              <Button variant="secondary" size="sm" className="rounded-full">
                Выйти
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pt-4 pb-12 sm:pt-5 sm:pb-16">{children}</main>
    </div>
  );
}
