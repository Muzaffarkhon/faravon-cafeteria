import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERIOD_STATUS_LABELS } from "@/lib/labels";
import { computeReport, listReportPeriods, type Report } from "@/lib/reports";
import { Card, EmptyState, Select, buttonClass, cx } from "@/components/ui";

const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);
const fmtNum = (v: number | null, d = 2) => (v == null ? "—" : v.toFixed(d));
const fmtDays = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} дн.`);

type Tone = "good" | "bad" | "neutral";
const TONE_BAR: Record<Tone, string> = {
  good: "bg-success",
  bad: "bg-warning",
  neutral: "bg-primary",
};

/** Плитка-метрика с полосой-индикатором для процентных показателей. */
function Metric({
  label,
  value,
  pct,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  pct?: number | null;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">{label}</div>
      <div className="mt-2 text-[28px] font-bold tracking-tight text-primary-strong tabular-nums">{value}</div>
      {pct != null && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={cx("h-full rounded-full", TONE_BAR[tone])}
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      )}
      {hint && <div className="mt-2 text-xs leading-5 text-ink-subtle">{hint}</div>}
    </Card>
  );
}

/** Горизонтальный бар-лист: значение и полоса пропорционально максимуму. */
function BarList({
  title,
  unit,
  rows,
}: {
  title: string;
  unit: string;
  rows: { label: string; n: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="rounded-[20px] bg-surface p-6 shadow-sm sm:p-7">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <span className="text-[11px] uppercase tracking-[0.1em] text-ink-subtle">{unit}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-subtle">Нет данных.</p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate font-semibold text-ink">{r.label}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">{r.n}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(r.n / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      <div className="flex items-center justify-end gap-2">
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Активация"
          value={fmtPct(k.activationPct)}
          pct={k.activationPct}
          tone="good"
          hint={`${k.everLoggedIn} из ${k.accounts} вошли хотя бы раз`}
        />
        <Metric
          label="Вовлечение"
          value={fmtPct(k.engagementPct)}
          pct={k.engagementPct}
          tone="good"
          hint={`${k.engagedLoggedIn} из ${k.everLoggedIn} вошедших выбрали ≥ 1 льготу`}
        />
        <Metric
          label="Льгот на активного сотрудника"
          value={fmtNum(k.avgSelectionsPerActive)}
          hint={`${k.activeEmployees} активных в периоде`}
        />
        <Metric
          label="Конверсия заявка → купон"
          value={fmtPct(k.conversionPct)}
          pct={k.conversionPct}
          tone="good"
          hint={`${k.issued} из ${k.submitted} поданных`}
        />
        <Metric
          label="Доля отклонений"
          value={fmtPct(k.rejectionPct)}
          pct={k.rejectionPct}
          tone="bad"
          hint={`${k.rejected} из ${k.decided} решений`}
        />
        <Metric
          label="Время до решения"
          value={fmtDays(k.avgDecisionDays)}
          hint={`p90: ${fmtDays(k.p90DecisionDays)}`}
        />
        <Metric
          label="Время до выдачи купона"
          value={fmtDays(k.avgIssueDays)}
          hint={`p90: ${fmtDays(k.p90IssueDays)}`}
        />
        <Metric
          label="Нарушения SLA согласования"
          value={fmtPct(k.slaBreachPct)}
          pct={k.slaBreachPct}
          tone="bad"
          hint={`${k.slaBreached} позиций (порог 5 раб. дн.)`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Топ льгот по числу выборов"
          unit="выборов"
          rows={report.topSelections.map((r) => ({ label: r.title, n: r.n }))}
        />
        <BarList
          title="Топ льгот по числу одобрений"
          unit="одобрено"
          rows={report.topApprovals.map((r) => ({ label: r.title, n: r.n }))}
        />
        <BarList
          title="Отклонения по причинам"
          unit="кол-во"
          rows={report.rejectionsByReason.map((r) => ({ label: r.reason, n: r.n }))}
        />
        <BarList
          title="Выборы по подразделениям"
          unit="позиций"
          rows={report.byDepartment.map((r) => ({
            label: `${r.department} · ${r.employees} чел.`,
            n: r.items,
          }))}
        />
      </div>

      <p className="text-xs leading-5 text-ink-subtle">
        «Экспорт в XLSX» выгружает книгу с листами «Метрики»,
        «Топ льгот», «Отклонения», «Подразделения».{" "}
        <Link href="/admin/periods" className="text-primary hover:underline">
          Управление периодами
        </Link>
        .
      </p>
    </div>
  );
}
