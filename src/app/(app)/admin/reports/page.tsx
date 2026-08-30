import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERIOD_STATUS_LABELS } from "@/lib/labels";
import { computeReport, listReportPeriods, type Report } from "@/lib/reports";

const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);
const fmtNum = (v: number | null, d = 2) => (v == null ? "—" : v.toFixed(d));
const fmtDays = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} дн.`);

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-neutral-400">{hint}</div>}
    </div>
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
    <section className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-red-700">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-3 text-sm text-neutral-400">Нет данных.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-1.5 font-medium">{head[0]}</th>
              <th className="px-4 py-1.5 text-right font-medium">{head[1]}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td className="px-4 py-1.5">{k}</td>
                <td className="px-4 py-1.5 text-right tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
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
    return <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">Периодов ещё нет.</div>;
  }

  const sp = await searchParams;
  const periodId = sp.period && periods.some((p) => p.id === sp.period) ? sp.period : periods[0].id;
  const report = (await computeReport(periodId)) as Report;
  const k = report.kpis;
  const exportBase = `/admin/reports/export?period=${periodId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Отчёты и метрики</h1>
        <div className="flex items-center gap-2">
          <form method="get" className="flex items-center gap-2">
            <select
              name="period"
              defaultValue={periodId}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {PERIOD_STATUS_LABELS[p.status]}
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
              Показать
            </button>
          </form>
          <a
            href={`${exportBase}`}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Экспорт в XLSX
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Активация" value={fmtPct(k.activationPct)} hint={`${k.everLoggedIn} из ${k.accounts} вошли хотя бы раз`} />
        <Metric label="Вовлечение" value={fmtPct(k.engagementPct)} hint={`${k.withSelection} выбрали ≥ 1 льготу`} />
        <Metric label="Льгот на активного сотрудника" value={fmtNum(k.avgSelectionsPerActive)} hint={`${k.activeEmployees} активных в периоде`} />
        <Metric label="Конверсия заявка → купон" value={fmtPct(k.conversionPct)} hint={`${k.issued} из ${k.submitted} поданных`} />
        <Metric label="Доля отклонений" value={fmtPct(k.rejectionPct)} hint={`${k.rejected} из ${k.decided} решений`} />
        <Metric label="Время до решения" value={fmtDays(k.avgDecisionDays)} hint={`p90: ${fmtDays(k.p90DecisionDays)}`} />
        <Metric label="Время до выдачи купона" value={fmtDays(k.avgIssueDays)} hint={`p90: ${fmtDays(k.p90IssueDays)}`} />
        <Metric label="Нарушения SLA согласования" value={fmtPct(k.slaBreachPct)} hint={`${k.slaBreached} позиций (порог 5 дн.)`} />
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

      <p className="text-xs text-neutral-400">
        Метрики продукта — ТЗ v2 §12. Кнопка «Экспорт в XLSX» выгружает книгу с листами
        «Метрики», «Топ льгот», «Отклонения», «Подразделения» (§5.12).{" "}
        <Link href="/admin/periods" className="hover:underline">
          Управление периодами
        </Link>
        .
      </p>
    </div>
  );
}
