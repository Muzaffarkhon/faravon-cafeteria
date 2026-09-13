import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERIOD_STATUS_LABELS } from "@/lib/labels";
import { computeReport, listReportPeriods, type Report } from "@/lib/reports";
import { Card, EmptyState, Select, buttonClass, cx } from "@/components/ui";
import { getTranslator } from "@/lib/i18n";

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
  noDataLabel,
}: {
  title: string;
  unit: string;
  rows: { label: string; n: number }[];
  noDataLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="rounded-[20px] bg-surface p-6 shadow-sm sm:p-7">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <span className="text-[11px] uppercase tracking-[0.1em] text-ink-subtle">{unit}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-subtle">{noDataLabel}</p>
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
  const t = await getTranslator();

  const periods = await listReportPeriods();
  if (periods.length === 0) {
    return <EmptyState>{t("reports.noPeriods")}</EmptyState>;
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
          <button className={buttonClass({ variant: "secondary", size: "sm" })}>{t("reports.show")}</button>
        </form>
        <a href={exportBase} className={buttonClass({ size: "sm" })}>
          {t("reports.exportXlsx")}
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label={t("reports.activation")}
          value={fmtPct(k.activationPct)}
          pct={k.activationPct}
          tone="good"
          hint={`${k.everLoggedIn} ${t("reports.of")} ${k.accounts} ${t("reports.activationHintSuffix")}`}
        />
        <Metric
          label={t("reports.engagement")}
          value={fmtPct(k.engagementPct)}
          pct={k.engagementPct}
          tone="good"
          hint={`${k.engagedLoggedIn} ${t("reports.of")} ${k.everLoggedIn} ${t("reports.engagementHintSuffix")}`}
        />
        <Metric
          label={t("reports.benefitsPerActive")}
          value={fmtNum(k.avgSelectionsPerActive)}
          hint={`${k.activeEmployees} ${t("reports.benefitsPerActiveHint")}`}
        />
        <Metric
          label={t("reports.conversion")}
          value={fmtPct(k.conversionPct)}
          pct={k.conversionPct}
          tone="good"
          hint={`${k.issued} ${t("reports.of")} ${k.submitted} ${t("reports.conversionHintSuffix")}`}
        />
        <Metric
          label={t("reports.rejectionShare")}
          value={fmtPct(k.rejectionPct)}
          pct={k.rejectionPct}
          tone="bad"
          hint={`${k.rejected} ${t("reports.of")} ${k.decided} ${t("reports.rejectionShareHintSuffix")}`}
        />
        <Metric
          label={t("reports.timeToDecision")}
          value={fmtDays(k.avgDecisionDays)}
          hint={`p90: ${fmtDays(k.p90DecisionDays)}`}
        />
        <Metric
          label={t("reports.timeToIssue")}
          value={fmtDays(k.avgIssueDays)}
          hint={`p90: ${fmtDays(k.p90IssueDays)}`}
        />
        <Metric
          label={t("reports.slaBreach")}
          value={fmtPct(k.slaBreachPct)}
          pct={k.slaBreachPct}
          tone="bad"
          hint={`${k.slaBreached} ${t("reports.slaBreachHint")}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title={t("reports.topSelections")}
          unit={t("reports.selectionsUnit")}
          rows={report.topSelections.map((r) => ({ label: r.title, n: r.n }))}
          noDataLabel={t("reports.noData")}
        />
        <BarList
          title={t("reports.topApprovals")}
          unit={t("reports.approvedUnit")}
          rows={report.topApprovals.map((r) => ({ label: r.title, n: r.n }))}
          noDataLabel={t("reports.noData")}
        />
        <BarList
          title={t("reports.rejectionsByReason")}
          unit={t("reports.countUnit")}
          rows={report.rejectionsByReason.map((r) => ({ label: r.reason, n: r.n }))}
          noDataLabel={t("reports.noData")}
        />
        <BarList
          title={t("reports.byDepartment")}
          unit={t("reports.itemsUnit")}
          rows={report.byDepartment.map((r) => ({
            label: `${r.department} · ${r.employees} ${t("reports.peopleUnit")}`,
            n: r.items,
          }))}
          noDataLabel={t("reports.noData")}
        />
      </div>

      <p className="text-xs leading-5 text-ink-subtle">
        {t("reports.exportHint")}{" "}
        <Link href="/admin/periods" className="text-primary hover:underline">
          {t("reports.managePeriods")}
        </Link>
        .
      </p>
    </div>
  );
}
