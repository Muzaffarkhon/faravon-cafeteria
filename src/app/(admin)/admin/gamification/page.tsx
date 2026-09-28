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
import { createGamificationTask, toggleTaskActive, completeTaskManually, decideRedemption, toggleWheelSector } from "./actions";
import { getGamificationEnabled, getDailyBonusCoins, getWheelSettings } from "@/lib/gamification-settings";
import { listWheelSectors, wheelSectorLabel, prizeCardProblem } from "@/lib/wheel";
import { dushanbeDateKey } from "@/lib/dushanbe-date";
import { WheelSettingsForm, WheelSectorForm, EditWheelSector, DeleteWheelSectorButton } from "./_wheel-admin";
import { TabsShell } from "./_tabs";

const WHEEL_KIND_LABEL = { COUPON: "Купон", COINS: "Монеты", NOTHING: "Без приза" } as const;

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

  const [tasks, pendingManual, pendingRequests, enabled, dailyBonusCoins, departmentRows] = await Promise.all([
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
    getDailyBonusCoins(),
    // Тот же паттерн, что в /admin/news — список отделов для Select, не
    // свободный ввод (опечатка в свободном тексте → задача не находит ни
    // одного сотрудника, ошибка не заметна сразу).
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
  ]);
  const departments = departmentRows.map((d) => d.department);

  const [wheelSettings, wheelSectors, prizeCardsRaw, wheelWinners] = await Promise.all([
    getWheelSettings(),
    listWheelSectors({ includeInactive: true }),
    db.benefitCard.findMany({
      where: { status: "PUBLISHED", isActive: true, archivedAt: null, minParticipants: 1 },
      include: { partner: { select: { name: true, deliveryMode: true } } },
      orderBy: { title: "asc" },
    }),
    db.wheelSpin.findMany({
      where: { kind: "COUPON" },
      include: { employee: { select: { fullName: true, department: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  // Прокруток сегодня — для контроля наплыва/спама в моменте (§ дневной лимит — 1 на сотрудника).
  const spinsToday = await db.wheelSpin.count({ where: { dayKey: dushanbeDateKey() } });
  const prizeCards = prizeCardsRaw
    .filter((c) => !prizeCardProblem(c))
    .map((c) => ({ id: c.id, title: c.title, partnerName: c.partner?.name ?? null }));
  const activeWeightTotal = wheelSectors.filter((s) => s.isActive).reduce((sum, s) => sum + s.weight, 0);
  const nextPosition = Math.max(0, ...wheelSectors.map((s) => s.position)) + 1;
  const fmtDate = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Dushanbe" });

  const activeSectors = wheelSectors.filter((s) => s.isActive).length;
  const pendingTotal = pendingManual.length + pendingRequests.length;

  // Обзор: тумблер геймификации + беглый счёт по остальным вкладкам — вместо
  // того чтобы всё это разворачивать здесь же полными таблицами.
  const overviewPanel = (
    <>
      <GamificationEnabledToggle enabled={enabled} dailyBonusCoins={dailyBonusCoins} locale={locale} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Прокруток сегодня", value: spinsToday },
          { label: "Активных листков колеса", value: activeSectors },
          { label: "Активных заданий", value: tasks.filter((x) => x.isActive).length },
          { label: "Ждут решения", value: pendingTotal },
        ].map((stat) => (
          <Card key={stat.label} className="p-3.5">
            <div className="text-2xl font-bold tabular-nums text-ink">{stat.value}</div>
            <div className="text-xs font-semibold text-ink-muted">{stat.label}</div>
          </Card>
        ))}
      </div>
    </>
  );

  const wheelPanel = (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle className="text-lg" count={activeSectors}>Колесо подарков</SectionTitle>
        <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary-strong">
          Прокруток сегодня: {spinsToday}
        </span>
      </div>
      <WheelSettingsForm enabled={wheelSettings.wheelEnabled} spinCost={wheelSettings.wheelSpinCost} />
      {wheelSectors.length === 0 ? (
          <EmptyState>Листков пока нет — добавьте первый ниже.</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>Место</th>
                  <th>Приз</th>
                  <th>Шанс</th>
                  <th>Выиграно</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {wheelSectors.map((s) => {
                  const label = wheelSectorLabel(s);
                  const problem = s.kind === "COUPON" && s.card ? prizeCardProblem(s.card) : null;
                  return (
                    <tr key={s.id} className={s.isActive ? undefined : "opacity-60"}>
                      <td data-numeric>{s.position}</td>
                      <td className="text-ink">
                        <span className="text-ink-subtle">{WHEEL_KIND_LABEL[s.kind]} · </span>
                        {label}
                        {s.kind === "COUPON" && s.card?.partner && <span className="text-ink-subtle"> · {s.card.partner.name}</span>}
                        {problem && <span className="mt-1 block text-xs font-semibold text-danger">Не разыгрывается: {problem}</span>}
                      </td>
                      <td data-numeric title={`Вес ${s.weight}`}>
                        {s.isActive && activeWeightTotal > 0 ? `${Math.round((s.weight / activeWeightTotal) * 1000) / 10}%` : "—"}
                      </td>
                      <td data-numeric>{s.kind === "COUPON" ? `${s.wonCount} из ${s.quantity ?? 0}` : "—"}</td>
                      <td>
                        <ActionForm action={toggleWheelSector.bind(null, s.id, !s.isActive)}>
                          <SubmitButton variant={s.isActive ? "secondary" : "soft"} size="sm">
                            {s.isActive ? "Убрать с колеса" : "Вернуть на колесо"}
                          </SubmitButton>
                        </ActionForm>
                      </td>
                      <td className="space-x-2 whitespace-nowrap text-right">
                        <EditWheelSector
                          sector={{
                            id: s.id,
                            position: s.position,
                            kind: s.kind,
                            label: s.label,
                            weight: s.weight,
                            coins: s.coins,
                            cardId: s.cardId,
                            quantity: s.quantity,
                            wonCount: s.wonCount,
                          }}
                          cards={prizeCards}
                        />
                        <DeleteWheelSectorButton sectorId={s.id} label={label} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
        <p className="text-xs text-ink-muted">
          Шанс считается от суммы весов листков на колесе. Если купон закончился или сотрудник уже получил эту льготу в
          периоде, листок остаётся на колесе, но для него не выпадает — поэтому держите хотя бы один листок с монетами
          или «без приза».
        </p>
        <Card className="max-w-2xl p-4">
          <p className="mb-3 text-sm font-semibold text-ink">Новый листок</p>
          <WheelSectorForm cards={prizeCards} nextPosition={nextPosition} />
        </Card>
        {wheelWinners.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Победители — купоны ({wheelWinners.length})</summary>
            <Card className="mt-3 overflow-hidden">
              <Table stickyHeader>
                <thead>
                  <tr>
                    <th>Когда</th>
                    <th>Сотрудник</th>
                    <th>Приз</th>
                  </tr>
                </thead>
                <tbody>
                  {wheelWinners.map((w) => (
                    <tr key={w.id}>
                      <td data-numeric className="text-ink-muted">{fmtDate.format(w.createdAt)}</td>
                      <td className="text-ink">
                        {w.employee.fullName}
                        <span className="text-ink-subtle"> · {w.employee.department}</span>
                      </td>
                      <td>{w.prizeLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </details>
        )}
      </section>
  );

  const tasksPanel = (
    <>
      <section className="space-y-3">
        <SectionTitle className="text-lg">{t("gamificationAdmin.newTaskSection")}</SectionTitle>
        <Card className="max-w-xl p-4">
          <TaskForm action={createGamificationTask} locale={locale} departments={departments} />
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
                        <SubmitButton variant={task.isActive ? "secondary" : "soft"} size="sm">
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
    </>
  );

  const requestsPanel = (
    <>
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
                        <SubmitButton variant="soft" size="sm">
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
                    <td className="space-x-2">
                      <ActionForm className="inline" action={decideRedemption.bind(null, r.id, "APPROVE")}>
                        <SubmitButton variant="success" size="sm">
                          {t("gamificationAdmin.approve")}
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm className="inline" action={decideRedemption.bind(null, r.id, "REJECT")}>
                        <SubmitButton variant="danger" size="sm">
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
    </>
  );

  return (
    <div data-wide className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{t("gamificationAdmin.title")}</h1>
      </header>

      <TabsShell
        tabs={[
          { id: "overview", label: "Обзор" },
          { id: "wheel", label: "Колесо подарков", badge: activeSectors },
          { id: "tasks", label: "Задания", badge: tasks.filter((x) => x.isActive).length },
          { id: "requests", label: "Заявки", badge: pendingTotal },
        ]}
        panels={[overviewPanel, wheelPanel, tasksPanel, requestsPanel]}
      />
    </div>
  );
}
