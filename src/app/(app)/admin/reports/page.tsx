import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERIOD_STATUS_LABELS } from "@/lib/labels";
import { computeReport, listReportPeriods, type Report } from "@/lib/reports";
import { Card, EmptyState, PageHeader, Select, buttonClass } from "@/components/ui";

const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);
const fmtNum = (v: number | null, d = 2) => (v == null ? "—" : v.toFixed(d));
const fmtDays = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} дн.`);

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-subtle">{hint}</div>}
    </Card>
  );
}

function MiniTable({
  title,
  head,
  rows,
}: {
  title: string;
  head: [string, string];
  rows: [string, number][];
}) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line-subtle px-4 py-2.5">
        <h3 className="text-sm font-semibold text-primary-strong">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-3 text-sm text-ink-subtle">Нет данных.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-1.5 font-medium">{head[0]}</th>
              <th className="px-4 py-1.5 text-right font-medium">{head[1]}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td className="px-4 py-1.5 text-ink">{k}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-ink">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "reports.view")) redirect("/");

  const periods = await listReportPeriods();
  if (periods.length === 0) {
    return <EmptyState>Периодов ещё нет.</EmptyState>;
  }

  const sp = await searchParams;
  const periodId = sp.period && periods.some((p) => p.id === sp.period) ? sp.period : periods[0].id;
  const report = (await computeReport(periodId)) as Report;
  const k = report.kpis;
  const exportBase = `/admin/reports/export?period=${periodId}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Отчёты и метрики"
        action={
          <div className="flex items-center gap-2">
            <form method="get" className="flex items-center gap-2">
              <Select name="period" defaultValue={periodId} className="w-auto py-1.5 text-sm">
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {PERIOD_STATUS_LABELS[p.status]}
                  </option>
                ))}
              </Select>
              <button className={buttonClass({ variant: "secondary", size: "sm" })}>Показать</button>
            </form>
            <a href={exportBase} className={buttonClass({ size: "sm" })}>
              Экспорт в XLSX
            </a>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Активация" value={fmtPct(k.activationPct)} hint={`${k.everLoggedIn} из ${k.accounts} вошли хотя бы раз`} />
        <Metric label="Вовлечение" value={fmtPct(k.engagementPct)} hint={`${k.engagedLoggedIn} из ${k.everLoggedIn} вошедших выбрали ≥ 1 льготу`} />
        <Metric label="Льгот на активного сотрудника" value={fmtNum(k.avgSelectionsPerActive)} hint={`${k.activeEmployees} активных в периоде`} />
        <Metric label="Конверсия заявка → купон" value={fmtPct(k.conversionPct)} hint={`${k.issued} из ${k.submitted} поданных`} />
        <Metric label="Доля отклонений" value={fmtPct(k.rejectionPct)} hint={`${k.rejected} из ${k.decided} решений`} />
        <Metric label="Время до решения" value={fmtDays(k.avgDecisionDays)} hint={`p90: ${fmtDays(k.p90DecisionDays)}`} />
        <Metric label="Время до выдачи купона" value={fmtDays(k.avgIssueDays)} hint={`p90: ${fmtDays(k.p90IssueDays)}`} />
        <Metric label="Нарушения SLA согласования" value={fmtPct(k.slaBreachPct)} hint={`${k.slaBreached} позиций (порог 5 раб. дн.)`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MiniTable
          title="Топ льгот по числу выборов"
          head={["Льгота", "Выборов"]}
          rows={report.topSelections.map((r) => [r.title, r.n])}
        />
        <MiniTable
          title="Топ льгот по числу одобрений"
          head={["Льгота", "Одобрено"]}
          rows={report.topApprovals.map((r) => [r.title, r.n])}
        />
        <MiniTable
          title="Отклонения по причинам"
          head={["Причина", "Кол-во"]}
          rows={report.rejectionsByReason.map((r) => [r.reason, r.n])}
        />
        <MiniTable
          title="Выборы по подразделениям"
          head={["Подразделение", "Позиций"]}
          rows={report.byDepartment.map((r) => [`${r.department} (${r.employees} чел.)`, r.items])}
        />
      </div>

      <p className="text-xs text-ink-subtle">
        Метрики продукта — ТЗ v2 §12. Кнопка «Экспорт в XLSX» выгружает книгу с листами
        «Метрики», «Топ льгот», «Отклонения», «Подразделения» (§5.12).{" "}
        <Link href="/admin/periods" className="text-primary hover:underline">
          Управление периодами
        </Link>
        .
      </p>
    </div>
  );
}
