import { redirect } from "next/navigation";
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
  const items: NavItem[] = [];
  if (session.employee) {
    items.push(
      { href: "/", label: "Обзор" },
      { href: "/applications", label: "Мои заявки и купоны" },
    );
  }
  if (can(roles, "applications.decide")) items.push({ href: "/review", label: "Согласование" });
  if (can(roles, "coupons.manage")) items.push({ href: "/coupons", label: "Купоны" });
  if (can(roles, "cards.manage")) items.push({ href: "/admin/cards", label: "Карточки" });
  if (can(roles, "partners.manage")) items.push({ href: "/admin/partners", label: "Партнёры" });
  if (can(roles, "cards.manage")) items.push({ href: "/admin/texts", label: "Тексты" });
  if (can(roles, "periods.manage")) items.push({ href: "/admin/periods", label: "Периоды" });
  if (can(roles, "reports.view")) items.push({ href: "/admin/reports", label: "Отчёты" });
  if (can(roles, "access.manage")) items.push({ href: "/admin/access", label: "Доступ" });
  items.push({ href: "/profile", label: "Профиль" });

  return (
    <div className="relative isolate min-h-dvh bg-canvas text-ink">
      <PetalDrift fixed />
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <BrandLockup markSize={30} />

          <div className="flex items-center gap-4">
            <AppNav items={items} />
            <span className="hidden text-xs text-ink-subtle md:inline">
              {roles.map((r) => ROLE_LABELS[r]).join(", ")}
            </span>
            <form action={logout}>
              <Button variant="secondary" size="sm">
                Выйти
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
