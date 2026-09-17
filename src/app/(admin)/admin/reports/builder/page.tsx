import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  parseDataset,
  parseGroupFields,
  parseCalcFields,
  listPeriodsForBuilder,
  runBuilderReport,
  topSupportWords,
  PRESET_CONFIG_KEYS,
  GROUP_CATALOG,
  CALC_CATALOG,
  DATASET_LABELS,
  type Dataset,
} from "@/lib/report-builder";
import { Card, EmptyState, Field, Input, Table, buttonClass, cx } from "@/components/ui";
import { listReportPresets, saveReportPreset, deleteReportPreset } from "./actions";
import { FieldsEditor } from "./_fields-editor";
import { FilterModal, type FilterState } from "./_filter-modal";

const BENEFITS_FILTER_KEYS = ["periodId", "status", "cardQuery", "departmentQuery"] as const;
const SUPPORT_FILTER_KEYS = ["topic", "source", "status"] as const;
const SHARED_FILTER_KEYS = ["dateFrom", "dateTo", "limit"] as const;

type BuilderSearchParams = Partial<Record<(typeof PRESET_CONFIG_KEYS)[number], string>>;

function toQueryString(sp: BuilderSearchParams, keys: readonly (keyof BuilderSearchParams)[]): string {
  const params = new URLSearchParams();
  for (const key of keys) {
    const v = sp[key];
    if (v) params.set(key, v);
  }
  return params.toString();
}

/**
 * Конструктор сводных отчётов: слева результат, справа — панель настроек
 * (референс: ATLAS «Аналитика») — произвольные поля группировки (для даты —
 * с режимом группировки: день/неделя/месяц/квартал/год) и произвольные
 * вычисляемые поля (агрегатная функция на каждое), плюс отдельное модальное
 * окно фильтра. Два источника данных (`Dataset`) — «Льготы» и «Обращения»
 * (чат поддержки: тема/источник/статус + «Топ слов» по текстам обращений).
 * Считает через `runBuilderReport` (`lib/report-builder.ts`).
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
  const dataset = parseDataset(sp.dataset);
  const groupCatalog = GROUP_CATALOG[dataset];
  const calcCatalog = CALC_CATALOG[dataset];

  const parsedGroupFields = parseGroupFields(sp.g).filter((f) => groupCatalog.some((c) => c.id === f.field));
  const parsedCalcFields = parseCalcFields(sp.c);
  const resolvedGroupFields = parsedGroupFields.length ? parsedGroupFields : [{ field: groupCatalog[0].id }];
  const resolvedCalcFields = parsedCalcFields.length ? parsedCalcFields : [{ agg: calcCatalog[0].agg, label: calcCatalog[0].label }];
  const limit = sp.limit ? Math.max(1, Number.parseInt(sp.limit, 10) || 0) : undefined;

  const [periods, presets] = await Promise.all([listPeriodsForBuilder(), listReportPresets()]);

  const filterCfg = {
    dataset,
    periodId: sp.periodId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    status: sp.status,
    cardQuery: sp.cardQuery,
    departmentQuery: sp.departmentQuery,
    topic: sp.topic,
    source: sp.source,
  };

  const [result, topWords] = await Promise.all([
    runBuilderReport({ ...filterCfg, groupFields: resolvedGroupFields, calcFields: resolvedCalcFields, limit }),
    dataset === "support" ? topSupportWords(filterCfg, 30) : Promise.resolve([]),
  ]);

  const resolvedSp: BuilderSearchParams = {
    ...sp,
    dataset,
    g: JSON.stringify(resolvedGroupFields),
    c: JSON.stringify(resolvedCalcFields),
  };
  const fullQuery = toQueryString(resolvedSp, PRESET_CONFIG_KEYS);
  const exportHref = `/admin/reports/builder/export?${fullQuery}`;

  const datasetFilterKeys = dataset === "benefits" ? BENEFITS_FILTER_KEYS : SUPPORT_FILTER_KEYS;
  const allFilterKeys = [...datasetFilterKeys, ...SHARED_FILTER_KEYS] as const;
  const fieldsRestQuery = toQueryString(resolvedSp, ["dataset", ...allFilterKeys]);
  const filterRestQuery = toQueryString(resolvedSp, ["dataset", "g", "c"] as const);
  const filterInitial: FilterState = {
    periodId: sp.periodId ?? "",
    status: sp.status ?? "",
    dateFrom: sp.dateFrom ?? "",
    dateTo: sp.dateTo ?? "",
    cardQuery: sp.cardQuery ?? "",
    departmentQuery: sp.departmentQuery ?? "",
    topic: sp.topic ?? "",
    source: sp.source ?? "",
    limit: sp.limit ?? "",
  };
  // Переключение источника данных — обычная ссылка (полный переход), сбрасывает
  // всё остальное: поля группировки/агрегации и фильтры одного источника
  // бессмысленны для другого.
  const datasetHref = (d: Dataset) => `/admin/reports/builder?dataset=${d}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">Конструктор отчётов</h1>
        <Link href="/admin/reports" className={buttonClass({ variant: "secondary", size: "sm" })}>
          К основным отчётам
        </Link>
      </div>

      <div className="flex gap-1.5 rounded-full border border-line bg-surface p-1 w-fit">
        {(Object.keys(DATASET_LABELS) as Dataset[]).map((d) => (
          <a
            key={d}
            href={datasetHref(d)}
            className={cx(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
              d === dataset ? "bg-primary text-on-brand" : "text-ink-muted hover:bg-surface-muted",
            )}
          >
            {DATASET_LABELS[d]}
          </a>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">
              Найдено записей: <b className="text-ink">{result.matchedCount}</b> · строк: {result.rows.length}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <FilterModal
                basePath="/admin/reports/builder"
                restQuery={filterRestQuery}
                dataset={dataset}
                periods={periods}
                initial={filterInitial}
              />
              <a href={exportHref} className={buttonClass({ variant: "secondary", size: "sm" })}>
                Экспорт в XLSX
              </a>
            </div>
          </div>

          {result.rows.length === 0 ? (
            <EmptyState>Нет данных по заданным условиям.</EmptyState>
          ) : (
            <Card className="overflow-hidden">
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
                        <td key={c.key} data-numeric={c.numeric || undefined} className={cx(j === 0 && "font-medium text-ink")}>
                          {r[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {result.totals && (
                    <tr className="bg-surface-muted" data-pin="end">
                      {result.columns.map((c, j) => (
                        <td key={c.key} data-numeric={c.numeric || undefined} className="font-bold text-ink">
                          {j === 0 ? "Итого" : (c.numeric ? result.totals![c.key] : "")}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card>
          )}

          {dataset === "support" && (
            <Card className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-bold text-ink">Топ слов в обращениях</h2>
                <span className="text-[11px] uppercase tracking-[0.1em] text-ink-subtle">по текстам входящих сообщений</span>
              </div>
              {topWords.length === 0 ? (
                <p className="text-sm text-ink-subtle">Нет данных по заданным условиям.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {topWords.map((w) => (
                    <span
                      key={w.word}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line-subtle bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink"
                      title={`${w.count} раз(а)`}
                    >
                      {w.word}
                      <span className="rounded-full bg-primary-soft px-1.5 text-[11px] font-bold text-primary-strong tabular-nums">
                        {w.count}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <form action={saveReportPreset} className="flex flex-wrap items-end gap-2">
                {PRESET_CONFIG_KEYS.map((key) => {
                  const value = resolvedSp[key];
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
                      {/* Обычная ссылка, не next/link: нужен полный переход — клиентская
                          навигация на тот же серверный компонент не пересоздаёт клиентские
                          FieldsEditor/FilterModal с новым initial-состоянием. */}
                      <a
                        href={`/admin/reports/builder?${toQueryString(p.config, PRESET_CONFIG_KEYS)}`}
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
        </div>

        <Card className="w-full shrink-0 p-4 lg:w-80">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Настройки</div>
          <FieldsEditor
            basePath="/admin/reports/builder"
            restQuery={fieldsRestQuery}
            groupCatalog={groupCatalog}
            calcCatalog={calcCatalog}
            groupFields={resolvedGroupFields}
            calcFields={resolvedCalcFields}
          />
        </Card>
      </div>
    </div>
  );
}
