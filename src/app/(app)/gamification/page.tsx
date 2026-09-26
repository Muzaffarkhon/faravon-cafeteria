import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n";
import { Badge, Card, EmptyState, SectionTitle, Table } from "@/components/ui";
import { listAvailableTasksForEmployee, listEmployeeTasks } from "@/lib/gamification-tasks";
import { getCoinBalance, listCoinEntries } from "@/lib/coin-wallet";
import { joinTaskAction, buyWithCoinsAction } from "./_actions";
import type { ActionResult } from "@/lib/action-result";

export const dynamic = "force-dynamic";

/** <form action> требует () => void | Promise<void> — оборачиваем ActionResult-действия. */
function asFormAction(fn: () => Promise<ActionResult>) {
  return async () => {
    await fn();
  };
}

export default async function GamificationPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.employee) redirect("/");
  const t = await getTranslator();
  const employeeId = session.employee.id;

  const [available, mine, balance, entries, shopCards] = await Promise.all([
    listAvailableTasksForEmployee(employeeId),
    listEmployeeTasks(employeeId),
    getCoinBalance(employeeId),
    listCoinEntries(employeeId, 10),
    db.benefitCard.findMany({
      where: { coinPrice: { not: null }, isActive: true, status: "PUBLISHED", archivedAt: null },
      orderBy: { coinPrice: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-[1.5625rem]">{t("gamification.title")}</h1>
        <div className="rounded-full bg-primary-soft px-4 py-1.5 text-sm font-bold text-primary-strong">
          {balance} {t("gamification.coinUnit")}
        </div>
      </header>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={available.length}>{t("gamification.availableTasks")}</SectionTitle>
        {available.length === 0 ? (
          <EmptyState>{t("gamification.noAvailableTasks")}</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {available.map((task) => (
              <Card key={task.id} className="space-y-2 p-4">
                <p className="font-semibold text-ink">{task.title}</p>
                <p className="text-sm text-ink-muted">{task.description}</p>
                <p className="text-sm font-medium text-primary-strong">
                  +{task.coinReward} {t("gamification.coinUnit")}
                </p>
                <form action={asFormAction(joinTaskAction.bind(null, task.id, null))}>
                  <button type="submit" className="text-sm font-medium text-primary-strong underline">
                    {t("gamification.joinTask")}
                  </button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={mine.length}>{t("gamification.myTasks")}</SectionTitle>
        {mine.length === 0 ? (
          <EmptyState>{t("gamification.noMyTasks")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("gamification.colTask")}</th>
                  <th>{t("gamification.colStatus")}</th>
                  <th>{t("gamification.colProgress")}</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((et) => (
                  <tr key={et.id}>
                    <td className="text-ink">{et.task.title}</td>
                    <td>
                      <Badge tone={et.status === "COMPLETED" ? "success" : "neutral"}>{et.status}</Badge>
                    </td>
                    <td data-numeric>
                      {et.task.verification === "AUTO" && et.task.targetValue ? `${et.progressValue} / ${et.task.targetValue}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={shopCards.length}>{t("gamification.shop")}</SectionTitle>
        {shopCards.length === 0 ? (
          <EmptyState>{t("gamification.shopEmpty")}</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shopCards.map((card) => (
              <Card key={card.id} className="space-y-2 p-4">
                <p className="font-semibold text-ink">{card.title}</p>
                <p className="text-sm font-medium text-primary-strong">
                  {card.coinPrice} {t("gamification.coinUnit")}
                </p>
                <form action={asFormAction(buyWithCoinsAction.bind(null, card.id))}>
                  <button
                    type="submit"
                    disabled={balance < (card.coinPrice ?? Infinity)}
                    className="text-sm font-medium text-primary-strong underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {card.coinRedemptionMode === "REQUEST" ? t("gamification.buyRequest") : t("gamification.buyInstant")}
                  </button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg">{t("gamification.history")}</SectionTitle>
        {entries.length === 0 ? (
          <EmptyState>{t("gamification.historyEmpty")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("gamification.colWhen")}</th>
                  <th>{t("gamification.colReason")}</th>
                  <th>{t("gamification.colAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="text-ink-muted" data-numeric>
                      {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(e.createdAt)}
                    </td>
                    <td>{e.reason}</td>
                    <td data-numeric className={e.kind === "SPENT" ? "text-danger" : "text-success"}>
                      {e.kind === "SPENT" ? "-" : "+"}
                      {e.amount}
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
