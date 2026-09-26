import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { Badge, Card, EmptyState, SectionTitle, Table, type BadgeTone } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ActionForm } from "@/components/action-form";
import { TaskForm } from "./_task-form";
import { GamificationEnabledToggle } from "./_enabled-toggle";
import { createGamificationTask, toggleTaskActive, completeTaskManually, decideRedemption } from "./actions";
import { getGamificationEnabled } from "@/lib/gamification-settings";

export const dynamic = "force-dynamic";

const REDEMPTION_STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "muted",
  FULFILLED: "success",
};

export default async function GamificationAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "gamification.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const [tasks, pendingManual, pendingRequests, enabled] = await Promise.all([
    db.gamificationTask.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.employeeTask.findMany({
      where: { status: "IN_PROGRESS", task: { is: { verification: "MANUAL" } } },
      include: { employee: { select: { fullName: true, department: true } }, task: { select: { title: true, coinReward: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    db.coinRedemption.findMany({
      where: { status: "PENDING" },
      include: { employee: { select: { fullName: true } }, benefitCard: { select: { title: true } } },
      orderBy: { createdAt: "asc" },
    }),
    getGamificationEnabled(),
  ]);

  return (
    <div data-wide className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{t("gamificationAdmin.title")}</h1>
      </header>

      <GamificationEnabledToggle enabled={enabled} locale={locale} />

      <section className="space-y-3">
        <SectionTitle className="text-lg">{t("gamificationAdmin.newTaskSection")}</SectionTitle>
        <Card className="max-w-xl p-4">
          <TaskForm action={createGamificationTask} locale={locale} />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={tasks.length}>{t("gamificationAdmin.tasksSection")}</SectionTitle>
        {tasks.length === 0 ? (
          <EmptyState>{t("gamificationAdmin.tasksEmpty")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("gamificationAdmin.colTitle")}</th>
                  <th>{t("gamificationAdmin.colReward")}</th>
                  <th>{t("gamificationAdmin.colVerification")}</th>
                  <th>{t("gamificationAdmin.colScope")}</th>
                  <th>{t("gamificationAdmin.colActive")}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td className="text-ink">{task.title}</td>
                    <td data-numeric>{task.coinReward}</td>
                    <td>{task.verification === "AUTO" ? `${t("gamificationAdmin.auto")} · ${task.autoMetric} ≥ ${task.targetValue}` : t("gamificationAdmin.manual")}</td>
                    <td>{task.scope === "ALL" ? t("gamificationAdmin.scopeAll") : task.scope === "DEPARTMENT" ? task.department : t("gamificationAdmin.scopeSpecific")}</td>
                    <td>
                      <ActionForm action={toggleTaskActive.bind(null, task.id, !task.isActive)}>
                        <SubmitButton className="text-sm underline disabled:cursor-not-allowed disabled:opacity-50">
                          {task.isActive ? t("gamificationAdmin.deactivate") : t("gamificationAdmin.activate")}
                        </SubmitButton>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={pendingManual.length}>{t("gamificationAdmin.pendingManualSection")}</SectionTitle>
        {pendingManual.length === 0 ? (
          <EmptyState>{t("gamificationAdmin.pendingManualEmpty")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("gamificationAdmin.colEmployee")}</th>
                  <th>{t("gamificationAdmin.colTask")}</th>
                  <th>{t("gamificationAdmin.colReward")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingManual.map((et) => (
                  <tr key={et.id}>
                    <td className="text-ink">
                      {et.employee.fullName}
                      <span className="text-ink-subtle"> · {et.employee.department}</span>
                    </td>
                    <td>{et.task.title}</td>
                    <td data-numeric>{et.task.coinReward}</td>
                    <td>
                      <ActionForm action={completeTaskManually.bind(null, et.id)}>
                        <SubmitButton className="text-sm font-medium text-primary-strong underline disabled:cursor-not-allowed disabled:opacity-50">
                          {t("gamificationAdmin.confirmCompletion")}
                        </SubmitButton>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={pendingRequests.length}>{t("gamificationAdmin.redemptionsSection")}</SectionTitle>
        {pendingRequests.length === 0 ? (
          <EmptyState>{t("gamificationAdmin.redemptionsEmpty")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("gamificationAdmin.colEmployee")}</th>
                  <th>{t("gamificationAdmin.colCard")}</th>
                  <th>{t("gamificationAdmin.colCost")}</th>
                  <th>{t("gamificationAdmin.colStatus")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink">{r.employee.fullName}</td>
                    <td>{r.benefitCard.title}</td>
                    <td data-numeric>{r.coinCost}</td>
                    <td>
                      <Badge tone={REDEMPTION_STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                    </td>
                    <td className="space-x-3">
                      <ActionForm className="inline" action={decideRedemption.bind(null, r.id, "APPROVE")}>
                        <SubmitButton className="text-sm font-medium text-success underline disabled:cursor-not-allowed disabled:opacity-50">
                          {t("gamificationAdmin.approve")}
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm className="inline" action={decideRedemption.bind(null, r.id, "REJECT")}>
                        <SubmitButton className="text-sm font-medium text-danger underline disabled:cursor-not-allowed disabled:opacity-50">
                          {t("gamificationAdmin.reject")}
                        </SubmitButton>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
