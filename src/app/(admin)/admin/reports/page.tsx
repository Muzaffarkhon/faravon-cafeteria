import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERIOD_STATUS_LABELS } from "@/lib/labels";
import { computeReport, listReportPeriods, type Report } from "@/lib/reports";
import { BarChartCard, LineChartCard } from "@/components/charts";
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

type Cmp = { prev: number | null; cur: number | null; unit: "pp" | "num" | "days"; better: "up" | "down" };

/** Разница с прошлым периодом: стрелка + значение; зелёный — улучшение, оранжевый — ухудшение. */
function Delta({ cmp, prevName }: { cmp: Cmp; prevName: string }) {
  if (cmp.cur == null || cmp.prev == null) return null;
  const diff = cmp.cur - cmp.prev;
  const rounded = Math.round(diff * 10) / 10;
  const text = rounded === 0 ? "без изменений" : `${rounded > 0 ? "▲ +" : "▼ "}${rounded}${cmp.unit === "pp" ? " п.п." : cmp.unit === "days" ? " дн." : ""}`;
  const good = rounded === 0 ? null : (rounded > 0) === (cmp.better === "up");
  return (
    <div
      className={cx("mt-1 text-[11px] font-semibold tabular-nums", good == null ? "text-ink-subtle" : good ? "text-success-strong" : "text-warning-strong")}
      title={`К периоду «${prevName}»: было ${Math.round(cmp.prev * 10) / 10}`}
    >
      {text}
    </div>
  );
}

/** Плитка-метрика с полосой-индикатором для процентных показателей. */
function Metric({
  label,
  value,
  pct,
  tone = "neutral",
  hint,
  cmp,
  prevName = "",
}: {
  label: string;
  value: string;
  pct?: number | null;
  tone?: Tone;
  hint?: string;
  cmp?: Cmp;
  prevName?: string;
}) {
  return (
    <Card className="flex flex-col p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tracking-tight text-primary-strong tabular-nums">{value}</div>
      {pct != null && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={cx("h-full rounded-full", TONE_BAR[tone])}
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      )}
      {cmp && <Delta cmp={cmp} prevName={prevName} />}
      {hint && <div className="mt-1 text-[11px] leading-4 text-ink-subtle">{hint}</div>}
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
    <div className="max-h-[26rem] overflow-y-auto rounded-xl bg-surface px-4 pb-4 shadow-sm">
      <div className="sticky top-0 z-10 flex items-baseline justify-between bg-surface pb-2 pt-4">
        <h3 className="text-xs font-bold text-ink">{title}</h3>
        <span className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">{unit}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-ink-subtle">{noDataLabel}</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate font-semibold text-ink">{r.label}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">{r.n}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
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
  const defaultPeriodId = periods.find((p) => p.status === "OPEN")?.id ?? periods[0].id;
  const periodId = sp.period && periods.some((p) => p.id === sp.period) ? sp.period : defaultPeriodId;
  const report = (await computeReport(periodId)) as Report;
  const k = report.kpis;
  const prevPeriod = periods[periods.findIndex((p) => p.id === periodId) + 1];
  const prev = prevPeriod ? await computeReport(prevPeriod.id) : null;
  const pk = prev?.kpis;
  const prevName = prevPeriod?.name ?? "";
  const cmp = (key: keyof Report["kpis"], unit: Cmp["unit"], better: Cmp["better"]): Cmp | undefined =>
    pk ? { cur: k[key], prev: pk[key], unit, better } : undefined;
  const exportBase = `/admin/reports/export?period=${periodId}`;

  return (
    <div data-wide className="space-y-4 text-[13px]">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <form method="get" className="flex min-w-0 max-w-full items-center gap-2">
          <Select name="period" defaultValue={periodId} className="w-auto min-w-0 max-w-full py-1.5 text-sm">
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
        <Link href="/admin/reports/builder" className={buttonClass({ variant: "secondary", size: "sm" })}>
          Конструктор отчётов
        </Link>
      </div>

      {prevPeriod && (
        <p className="text-xs text-ink-subtle">
          Изменения показателей — к периоду «{prevName}». ▲ зелёный — улучшение, оранжевый — ухудшение.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-9">
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
          cmp={cmp("engagementPct", "pp", "up")}
          prevName={prevName}
          pct={k.engagementPct}
          tone="good"
          hint={`${k.engagedLoggedIn} ${t("reports.of")} ${k.everLoggedIn} ${t("reports.engagementHintSuffix")}`}
        />
        <Metric
          label={t("reports.benefitsPerActive")}
          value={fmtNum(k.avgSelectionsPerActive)}
          cmp={cmp("avgSelectionsPerActive", "num", "up")}
          prevName={prevName}
          hint={`${k.activeEmployees} ${t("reports.benefitsPerActiveHint")}`}
        />
        <Metric
          label={t("reports.conversion")}
          value={fmtPct(k.conversionPct)}
          cmp={cmp("conversionPct", "pp", "up")}
          prevName={prevName}
          pct={k.conversionPct}
          tone="good"
          hint={`${k.issued} ${t("reports.of")} ${k.submitted} ${t("reports.conversionHintSuffix")}`}
        />
        <Metric
          label="Активировано купонов"
          value={String(k.activated)}
          cmp={cmp("activated", "num", "up")}
          prevName={prevName}
          pct={k.activatedPct}
          tone="good"
          hint={`${fmtPct(k.activatedPct)} от выданных (${k.couponsIssued}) · ${fmtPct(k.activatedOfSelectedPct)} от выбранных льгот`}
        />
        <Metric
          label={t("reports.rejectionShare")}
          value={fmtPct(k.rejectionPct)}
          cmp={cmp("rejectionPct", "pp", "down")}
          prevName={prevName}
          pct={k.rejectionPct}
          tone="bad"
          hint={`${k.rejected} ${t("reports.of")} ${k.decided} ${t("reports.rejectionShareHintSuffix")}`}
        />
        <Metric
          label={t("reports.timeToDecision")}
          value={fmtDays(k.avgDecisionDays)}
          cmp={cmp("avgDecisionDays", "days", "down")}
          prevName={prevName}
          hint={`p90: ${fmtDays(k.p90DecisionDays)}`}
        />
        <Metric
          label={t("reports.timeToIssue")}
          value={fmtDays(k.avgIssueDays)}
          cmp={cmp("avgIssueDays", "days", "down")}
          prevName={prevName}
          hint={`p90: ${fmtDays(k.p90IssueDays)}`}
        />
        <Metric
          label={t("reports.slaBreach")}
          value={fmtPct(k.slaBreachPct)}
          cmp={cmp("slaBreachPct", "pp", "down")}
          prevName={prevName}
          pct={k.slaBreachPct}
          tone="bad"
          hint={`${k.slaBreached} ${t("reports.slaBreachHint")}`}
        />
      </div>

      <LineChartCard
        title="Динамика подачи заявок"
        unit="заявок/день"
        rows={report.dailySubmissions.map((r) => ({ label: r.day.slice(5), n: r.n }))}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <BarChartCard
          title={t("reports.topSelections")}
          unit={t("reports.selectionsUnit")}
          rows={report.topSelections.slice(0, 8).map((r) => ({ label: r.title, n: r.n }))}
        />
        <BarChartCard
          title={t("reports.topApprovals")}
          unit={t("reports.approvedUnit")}
          rows={report.topApprovals.slice(0, 8).map((r) => ({ label: r.title, n: r.n }))}
          color="var(--success)"
        />
        <BarChartCard
          title="Активировано купонов по льготам"
          unit="активаций"
          rows={report.topActivations.slice(0, 8).map((r) => ({ label: r.title, n: r.n }))}
          color="var(--success)"
        />
        <BarChartCard
          title={t("reports.byDepartment")}
          unit={t("reports.itemsUnit")}
          rows={report.byDepartment.slice(0, 8).map((r) => ({ label: r.department, n: r.items }))}
        />
        <BarChartCard
          title={t("reports.rejectionsByReason")}
          unit={t("reports.countUnit")}
          rows={report.rejectionsByReason.slice(0, 8).map((r) => ({ label: r.reason, n: r.n }))}
          color="var(--warning)"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <BarList
          title={t("reports.byDepartment")}
          unit={t("reports.itemsUnit")}
          rows={report.byDepartment.map((r) => ({
            label: `${r.department} · ${r.employees} ${t("reports.peopleUnit")}`,
            n: r.items,
          }))}
          noDataLabel={t("reports.noData")}
        />
        {/* Тот же полный (не обрезанный до 8 и не усечённый по ширине бара,
            как в графике выше) список — по льготам, а не только по
            подразделениям. */}
        <BarList
          title={t("reports.topSelections")}
          unit={t("reports.selectionsUnit")}
          rows={report.topSelections.map((r) => ({ label: r.title, n: r.n }))}
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
