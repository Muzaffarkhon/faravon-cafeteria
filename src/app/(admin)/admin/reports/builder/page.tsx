import Link from "next/link";
import { redirect } from "next/navigation";
import type { ItemStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  DIMENSION_LABELS,
  MEASURE_LABELS,
  PRESET_CONFIG_KEYS,
  listPeriodsForBuilder,
  runPivotReport,
  type PivotDimension,
  type PivotMeasure,
} from "@/lib/report-builder";
import { BarChartCard } from "@/components/charts";
import { Card, EmptyState, Field, Input, Select, Table, buttonClass, cx } from "@/components/ui";
import { listReportPresets, saveReportPreset, deleteReportPreset } from "./actions";

const DIMENSIONS: PivotDimension[] = ["department", "card", "partner", "status", "period", "day", "month"];
const MEASURES: PivotMeasure[] = ["count", "employees"];
const STATUSES: { value: ItemStatus; label: string }[] = [
  { value: "PENDING", label: "На согласовании" },
  { value: "APPROVED", label: "Одобрено" },
  { value: "REJECTED", label: "Отклонено" },
  { value: "COUPON_CREATED", label: "Купон сформирован" },
  { value: "COUPON_ISSUED", label: "Купон выдан" },
];

type BuilderSearchParams = {
  dimension?: string;
  columnDimension?: string;
  measure?: string;
  periodId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  cardQuery?: string;
  departmentQuery?: string;
  topN?: string;
};

/** Query-строка из текущих полей конструктора — для ссылок экспорта и пресетов. */
function toQueryString(sp: BuilderSearchParams): string {
  const params = new URLSearchParams();
  for (const key of PRESET_CONFIG_KEYS) {
    const v = sp[key];
    if (v) params.set(key, v);
  }
  return params.toString();
}

/**
 * Конструктор сводных отчётов: свободная группировка (подразделение, льгота,
 * партнёр, статус, период, день/месяц) + агрегация (количество / уникальные
 * сотрудники) + фильтр по периоду, дате подачи, статусу, названию льготы и
 * подразделению + ограничение топ-N + необязательное второе измерение по
 * колонкам (сводная таблица, как в Excel) + экспорт в XLSX + именованные
 * сохранённые срезы. Считает через `runPivotReport` (`lib/report-builder.ts`).
 */
export default async function ReportBuilderPage({
  searchParams,
}: {
  searchParams: Promise<BuilderSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "reports.view")) redirect("/");

  const sp = await searchParams;
  const dimension = DIMENSIONS.find((d) => d === sp.dimension) ?? "department";
  const columnDimension = DIMENSIONS.find((d) => d === sp.columnDimension && d !== dimension);
  const measure = MEASURES.find((m) => m === sp.measure) ?? "count";
  const status = STATUSES.find((s) => s.value === sp.status)?.value;
  const topN = sp.topN ? Math.max(1, Number.parseInt(sp.topN, 10) || 0) : undefined;

  const [periods, presets] = await Promise.all([listPeriodsForBuilder(), listReportPresets()]);

  const { rows, total, matrix } = await runPivotReport({
    dimension,
    columnDimension,
    measure,
    periodId: sp.periodId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    status,
    cardQuery: sp.cardQuery,
    departmentQuery: sp.departmentQuery,
    topN,
  });

  const query = toQueryString({ ...sp, dimension, columnDimension, measure, status });
  const exportHref = `/admin/reports/builder/export?${query}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">Конструктор отчётов</h1>
        <Link href="/admin/reports" className={buttonClass({ variant: "secondary", size: "sm" })}>
          К основным отчётам
        </Link>
      </div>

      <Card className="p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Группировка (строки)">
            <Select name="dimension" defaultValue={dimension}>
              {DIMENSIONS.map((d) => (
                <option key={d} value={d}>
                  {DIMENSION_LABELS[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Измерение по колонкам" hint="сводная таблица, как в Excel — необязательно">
            <Select name="columnDimension" defaultValue={columnDimension ?? ""}>
              <option value="">Нет — обычный список</option>
              {DIMENSIONS.filter((d) => d !== dimension).map((d) => (
                <option key={d} value={d}>
                  {DIMENSION_LABELS[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Агрегация">
            <Select name="measure" defaultValue={measure}>
              {MEASURES.map((m) => (
                <option key={m} value={m}>
                  {MEASURE_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Период">
            <Select name="periodId" defaultValue={sp.periodId ?? ""}>
              <option value="">Все периоды</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Статус позиции">
            <Select name="status" defaultValue={sp.status ?? ""}>
              <option value="">Любой (кроме отменённых)</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Дата подачи — от">
            <Input type="date" name="dateFrom" defaultValue={sp.dateFrom ?? ""} />
          </Field>
          <Field label="Дата подачи — до">
            <Input type="date" name="dateTo" defaultValue={sp.dateTo ?? ""} />
          </Field>
          <Field label="Льгота содержит">
            <Input name="cardQuery" defaultValue={sp.cardQuery ?? ""} placeholder="например, спорт" />
          </Field>
          <Field label="Подразделение содержит">
            <Input name="departmentQuery" defaultValue={sp.departmentQuery ?? ""} placeholder="например, IT" />
          </Field>
          <Field label="Топ-N строк (пусто — все)">
            <Input type="number" min={1} name="topN" defaultValue={sp.topN ?? ""} placeholder="например, 10" />
          </Field>
          <div className="flex items-end gap-2">
            <button className={buttonClass({ size: "sm" })}>Построить отчёт</button>
            <a href={exportHref} className={buttonClass({ variant: "secondary", size: "sm" })}>
              Экспорт в XLSX
            </a>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <form action={saveReportPreset} className="flex flex-wrap items-end gap-2">
            {PRESET_CONFIG_KEYS.map((key) => {
              const value = { ...sp, dimension, columnDimension, measure, status }[key];
              return value ? <input key={key} type="hidden" name={key} value={value} /> : null;
            })}
            <Field label="Сохранить текущий срез как">
              <Input name="presetName" placeholder="например, Льготы по месяцам" required className="w-64" />
            </Field>
            <button className={buttonClass({ variant: "secondary", size: "sm" })}>Сохранить срез</button>
          </form>

          {presets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                Сохранённые срезы:
              </span>
              {presets.map((p) => (
                <div key={p.id} className="flex items-center overflow-hidden rounded-full border border-line">
                  {/* Обычная ссылка, не next/link: нужен полный переход, чтобы
                      несontrolled-селекты формы (defaultValue) переинициализировались
                      под срез — при клиентской навигации на тот же компонент
                      React их не трогает, и они молча остаются от предыдущего вида. */}
                  <a
                    href={`/admin/reports/builder?${toQueryString(p.config)}`}
                    className="px-3 py-1 text-xs font-semibold text-ink hover:bg-surface-muted"
                  >
                    {p.name}
                  </a>
                  <form action={deleteReportPreset}>
                    <input type="hidden" name="presetId" value={p.id} />
                    <button
                      aria-label={`Удалить срез «${p.name}»`}
                      className="border-l border-line px-2 py-1 text-xs text-ink-subtle hover:bg-danger-soft hover:text-danger"
                    >
                      ×
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState>Нет данных по заданным условиям.</EmptyState>
      ) : matrix ? (
        <PivotTable
          rowDimensionLabel={DIMENSION_LABELS[dimension]}
          columnDimensionLabel={DIMENSION_LABELS[columnDimension!]}
          measureLabel={MEASURE_LABELS[measure]}
          matrix={matrix}
        />
      ) : (
        <>
          <BarChartCard
            title={`${DIMENSION_LABELS[dimension]} · ${MEASURE_LABELS[measure]}`}
            unit={`итого: ${total}`}
            rows={rows.slice(0, 20).map((r) => ({ label: r.label, n: r.value }))}
          />

          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{DIMENSION_LABELS[dimension]}</th>
                  <th>{MEASURE_LABELS[measure]}</th>
                  <th>Доля</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td className="font-medium text-ink">{r.label}</td>
                    <td data-numeric>{r.value}</td>
                    <td data-numeric className="text-ink-muted">
                      {total ? `${((r.value / total) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

/** Сводная таблица: строки × колонки, с итогами по каждой стороне и общим итогом. */
function PivotTable({
  rowDimensionLabel,
  columnDimensionLabel,
  measureLabel,
  matrix,
}: {
  rowDimensionLabel: string;
  columnDimensionLabel: string;
  measureLabel: string;
  matrix: {
    rowLabels: string[];
    columnLabels: string[];
    cells: number[][];
    rowTotals: number[];
    columnTotals: number[];
    grandTotal: number;
  };
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line-subtle px-4 py-2.5 text-xs text-ink-subtle">
        {rowDimensionLabel} × {columnDimensionLabel} · {measureLabel}
      </div>
      <Table stickyHeader>
        <thead>
          <tr>
            <th>{rowDimensionLabel}</th>
            {matrix.columnLabels.map((c) => (
              <th key={c} data-numeric className="text-right">
                {c}
              </th>
            ))}
            <th data-numeric className="text-right">
              Итого
            </th>
          </tr>
        </thead>
        <tbody>
          {matrix.rowLabels.map((r, i) => (
            <tr key={r}>
              <td className="font-medium text-ink">{r}</td>
              {matrix.cells[i].map((v, j) => (
                <td key={matrix.columnLabels[j]} data-numeric className={cx(!v && "text-ink-subtle")}>
                  {v || "—"}
                </td>
              ))}
              <td data-numeric className="font-semibold text-ink">
                {matrix.rowTotals[i]}
              </td>
            </tr>
          ))}
          <tr className="bg-surface-muted">
            <td className="font-bold text-ink">Итого</td>
            {matrix.columnTotals.map((v, j) => (
              <td key={matrix.columnLabels[j]} data-numeric className="font-bold text-ink">
                {v}
              </td>
            ))}
            <td data-numeric className="font-bold text-ink">
              {matrix.grandTotal}
            </td>
          </tr>
        </tbody>
      </Table>
    </Card>
  );
}
