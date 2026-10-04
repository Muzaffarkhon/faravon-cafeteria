import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  PRESET_CONFIG_KEYS,
  DATASET_LABELS,
  configFromParams,
  configToParams,
  listReportOptions,
  runBuilderReportCompared,
  topSupportWords,
  type Dataset,
  type ReportView,
} from "@/lib/report-builder";
import { BarChartCard, LineChartCard } from "@/components/charts";
import { Card, EmptyState, Input, Table, buttonClass, cx } from "@/components/ui";
import { listReportPresets, saveReportPreset } from "./actions";
import { FieldsEditor } from "./_fields-editor";
import { ConditionsEditor } from "./_conditions-editor";
import { SettingsPanel } from "./_settings-panel";
import { PresetRow } from "./_preset-row";

const BASE = "/admin/reports/builder";
const VIEW_LABELS: Record<ReportView, string> = { table: "Таблица", chart: "График", both: "Оба" };

const query = (params: Record<string, string>, omit: string[] = [], set: Record<string, string | null> = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...set })) {
    if (v != null && !omit.includes(k)) p.set(k, v);
  }
  return p.toString();
};

const toNum = (v: string | number | undefined) => (typeof v === "number" ? v : Number.parseFloat(String(v ?? "")) || 0);

/**
 * Конструктор сводных отчётов: результат на всю ширину, настройки —
 * сворачиваемая панель справа, условия — чипы над таблицей. Расчёт —
 * `runBuilderReportCompared` (`lib/report-builder.ts`).
 */
export default async function ReportBuilderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "reports.view")) redirect("/");

  const sp = await searchParams;
  const cfg = configFromParams((k) => sp[k]);
  const dataset = cfg.dataset;
  const params = configToParams(cfg);

  const [options, presets, { result, compareNote }, topWords] = await Promise.all([
    listReportOptions(dataset),
    listReportPresets(),
    runBuilderReportCompared(cfg),
    dataset === "support" ? topSupportWords(cfg, 30) : Promise.resolve([]),
  ]);

  const exportHref = `${BASE}/export?${query(params)}`;
  const nGroups = cfg.groupFields.length;
  const firstNum = result.columns.findIndex((c, i) => i >= nGroups && c.numeric);
  const dateFirst = /\(по /.test(result.columns[0]?.label ?? "");
  const chartRows =
    firstNum < 0
      ? []
      : result.rows.slice(0, dateFirst ? 90 : 20).map((r) => ({
          label: result.columns
            .slice(0, nGroups)
            .map((c) => r[c.key])
            .join(" · "),
          n: toNum(r[result.columns[firstNum].key]),
        }));
  const showTable = cfg.view !== "chart";
  const showChart = cfg.view !== "table";
  const chartTitle = firstNum >= 0 ? result.columns[firstNum].label : "";

  const pill = (active: boolean) =>
    cx("rounded-full px-3 py-1 text-xs font-semibold transition-colors", active ? "bg-primary text-on-brand" : "text-ink-muted hover:bg-surface-muted");

  return (
    <div data-wide className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-ink">Конструктор отчётов</h1>

        <div className="flex gap-0.5 rounded-full border border-line bg-surface p-0.5">
          {(Object.keys(DATASET_LABELS) as Dataset[]).map((d) => (
            // Обычная ссылка (полный переход): смена источника сбрасывает поля и условия.
            <a key={d} href={`${BASE}?dataset=${d}`} className={pill(d === dataset)}>
              {DATASET_LABELS[d]}
            </a>
          ))}
        </div>

        <div className="flex gap-0.5 rounded-full border border-line bg-surface p-0.5">
          {(Object.keys(VIEW_LABELS) as ReportView[]).map((v) => (
            <Link key={v} href={`${BASE}?${query(params, ["v"], { v: v === "table" ? null : v })}`} className={pill(cfg.view === v)}>
              {VIEW_LABELS[v]}
            </Link>
          ))}
        </div>

        {dataset !== "support" && (
          <Link
            href={`${BASE}?${query(params, ["cmp"], { cmp: cfg.compare ? null : "1" })}`}
            className={cx(buttonClass({ variant: cfg.compare ? "soft" : "secondary", size: "sm" }))}
            title="Добавить колонки Δ к предыдущему периоду (нужно условие «Период равно …»)"
          >
            ⇄ К прошлому периоду
          </Link>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink-muted">
            Записей: <b className="text-ink">{result.matchedCount}</b> · строк: {result.rows.length}
          </span>
          <a href={exportHref} className={buttonClass({ variant: "secondary", size: "sm" })}>
            XLSX
          </a>
          <Link href="/admin/reports" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Основные отчёты
          </Link>
        </div>
      </div>

      <ConditionsEditor
        basePath={BASE}
        restQuery={query(params, ["f", "limit"])}
        dataset={dataset}
        conditions={cfg.conditions}
        options={options}
        limit={cfg.limit}
      />
      {compareNote && <p className="text-xs text-ink-subtle">{compareNote}</p>}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-3">
          {result.rows.length === 0 ? (
            <EmptyState>Нет данных по заданным условиям.</EmptyState>
          ) : (
            <>
              {showChart &&
                (dateFirst ? (
                  <LineChartCard title={chartTitle} rows={chartRows} />
                ) : (
                  <BarChartCard title={chartTitle} rows={chartRows} />
                ))}
              {showTable && (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto text-xs [&_td]:!px-2.5 [&_td]:!py-1.5 [&_th]:!px-2.5 [&_th]:!py-1.5 [&_th]:!text-[11px]">
                    <Table stickyHeader>
                      <thead>
                        <tr>
                          {result.columns.map((c) => (
                            <th key={c.key} className={cx(c.numeric && "text-right")}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((r, i) => (
                          <tr key={i}>
                            {result.columns.map((c, j) => (
                              <td key={c.key} data-numeric={c.numeric || undefined} className={cx(c.numeric && "text-right", j === 0 && "font-medium text-ink")}>
                                {r[c.key]}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {result.totals && (
                          <tr className="bg-surface-muted" data-pin="end">
                            {result.columns.map((c, j) => (
                              <td key={c.key} data-numeric={c.numeric || undefined} className={cx("font-bold text-ink", c.numeric && "text-right")}>
                                {j === 0 ? "Итого" : (result.totals![c.key] ?? "")}
                              </td>
                            ))}
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                </Card>
              )}
            </>
          )}

          {dataset === "support" && (
            <Card className="p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-bold text-ink">Топ слов в обращениях</h2>
                <span className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">по текстам входящих сообщений</span>
              </div>
              {topWords.length === 0 ? (
                <p className="text-xs text-ink-subtle">Нет данных по заданным условиям.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {topWords.map((w) => (
                    <span
                      key={w.word}
                      className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink"
                      title={`${w.count} раз(а)`}
                    >
                      {w.word}
                      <span className="rounded-full bg-primary-soft px-1.5 text-[10px] font-bold tabular-nums text-primary-strong">{w.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card className="p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <form action={saveReportPreset} className="flex flex-wrap items-center gap-2">
                {PRESET_CONFIG_KEYS.map((key) => (params[key] ? <input key={key} type="hidden" name={key} value={params[key]} /> : null))}
                <Input name="presetName" placeholder="Название среза, например «Льготы по месяцам»" required maxLength={80} className="w-64 !py-1 !text-xs" />
                <label className="flex items-center gap-1 text-xs text-ink-muted">
                  <input type="checkbox" name="shared" /> общий
                </label>
                <button className={buttonClass({ variant: "secondary", size: "sm" })}>Сохранить срез</button>
              </form>

              {presets.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">Срезы:</span>
                  {presets.map((p) => (
                    <PresetRow
                      key={p.id}
                      id={p.id}
                      name={p.name}
                      href={`${BASE}?${query(p.config as Record<string, string>)}`}
                      shared={p.shared}
                      mine={p.mine}
                      author={p.author}
                      schedule={p.schedule}
                    />
                  ))}
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-ink-subtle">
              ✉ — присылать срез в Telegram около 09:00 по Душанбе. Срез с условием «Текущий период» всегда считается по открытому периоду.
            </p>
          </Card>
        </div>

        <SettingsPanel title="Настройки">
          <FieldsEditor
            basePath={BASE}
            restQuery={query(params, ["g", "c"])}
            dataset={dataset}
            groupFields={cfg.groupFields}
            calcFields={cfg.calcFields}
          />
        </SettingsPanel>
      </div>
    </div>
  );
}
