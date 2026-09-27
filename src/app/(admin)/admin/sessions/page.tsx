import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getTranslator } from "@/lib/i18n";
import { Badge, Card, EmptyState, SectionTitle, Table } from "@/components/ui";
import { onlineSessionWhere } from "@/lib/user-sessions";

export const dynamic = "force-dynamic";

/** "3 мин назад" / "сейчас" — без внешней библиотеки, только для этой страницы. */
function minutesAgo(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
}

export default async function SessionsAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "sessions.view")) redirect("/");
  const t = await getTranslator();

  const sessions = await db.userSession.findMany({
    where: onlineSessionWhere(),
    include: { user: { include: { employee: { select: { fullName: true, department: true } } } } },
    orderBy: { lastSeenAt: "desc" },
  });

  const deviceLabel = (device: string) =>
    device === "mobile" ? t("sessionsAdmin.deviceMobile") : device === "desktop" ? t("sessionsAdmin.deviceDesktop") : t("sessionsAdmin.deviceUnknown");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{t("sessionsAdmin.title")}</h1>
      </header>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={sessions.length}>{t("sessionsAdmin.title")}</SectionTitle>
        {sessions.length === 0 ? (
          <EmptyState>{t("sessionsAdmin.empty")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("sessionsAdmin.colEmployee")}</th>
                  <th>{t("sessionsAdmin.colDevice")}</th>
                  <th>{t("sessionsAdmin.colLocation")}</th>
                  <th>{t("sessionsAdmin.colLastSeen")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const mins = minutesAgo(s.lastSeenAt);
                  const location = [s.city, s.country].filter(Boolean).join(", ") || t("sessionsAdmin.locationUnknown");
                  return (
                    <tr key={s.id}>
                      <td className="text-ink">
                        {s.user.employee?.fullName ?? s.user.login}
                        {s.user.employee?.department && <span className="text-ink-subtle"> · {s.user.employee.department}</span>}
                      </td>
                      <td>
                        {deviceLabel(s.device)}
                        {s.browser && <span className="text-ink-subtle"> · {s.browser}</span>}
                      </td>
                      <td>{location}</td>
                      <td data-numeric>
                        {mins < 1 ? (
                          <Badge tone="success">{t("sessionsAdmin.online")}</Badge>
                        ) : (
                          `${mins} ${t("sessionsAdmin.minutesAgoSuffix")}`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
