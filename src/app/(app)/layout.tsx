import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, can } from "@/lib/rbac";
import { logout } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  const isEmployee = !!session.employee;
  const canReview = can(session.roles, "applications.decide");
  const canCoupons = can(session.roles, "coupons.manage");
  const canCards = can(session.roles, "cards.manage");
  const canPartners = can(session.roles, "partners.manage");
  const canPeriods = can(session.roles, "periods.manage");
  const canReports = can(session.roles, "reports.view");
  const canAccess = can(session.roles, "access.manage");

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-600 text-sm font-bold text-white">
              Ф
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Кафетерий льгот</div>
              <div className="text-xs text-neutral-500">Группа компаний «Фаровон»</div>
            </div>
          </div>

          <nav className="flex items-center gap-4 text-sm">
            {isEmployee && (
              <>
                <Link href="/" className="text-neutral-600 hover:text-red-600">
                  Обзор
                </Link>
                <Link href="/applications" className="text-neutral-600 hover:text-red-600">
                  Мои заявки и купоны
                </Link>
              </>
            )}
            {canReview && (
              <Link href="/review" className="text-neutral-600 hover:text-red-600">
                Согласование
              </Link>
            )}
            {canCoupons && (
              <Link href="/coupons" className="text-neutral-600 hover:text-red-600">
                Купоны
              </Link>
            )}
            {canCards && (
              <Link href="/admin/cards" className="text-neutral-600 hover:text-red-600">
                Карточки
              </Link>
            )}
            {canPartners && (
              <Link href="/admin/partners" className="text-neutral-600 hover:text-red-600">
                Партнёры
              </Link>
            )}
            {canCards && (
              <Link href="/admin/texts" className="text-neutral-600 hover:text-red-600">
                Тексты
              </Link>
            )}
            {canPeriods && (
              <Link href="/admin/periods" className="text-neutral-600 hover:text-red-600">
                Периоды
              </Link>
            )}
            {canReports && (
              <Link href="/admin/reports" className="text-neutral-600 hover:text-red-600">
                Отчёты
              </Link>
            )}
            {canAccess && (
              <Link href="/admin/access" className="text-neutral-600 hover:text-red-600">
                Доступ
              </Link>
            )}
            <Link href="/profile" className="text-neutral-600 hover:text-red-600">
              Профиль
            </Link>
            <span className="hidden text-xs text-neutral-400 sm:inline">
              {session.roles.map((r) => ROLE_LABELS[r]).join(", ")}
            </span>
            <form action={logout}>
              <button className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100">
                Выйти
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
