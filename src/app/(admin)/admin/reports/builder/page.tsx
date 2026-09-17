import Link from "next/link";
import { redirect } from "next/navigation";
import type { ItemStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  parseGroupFields,
  parseCalcFields,
  listPeriodsForBuilder,
  runBuilderReport,
  PRESET_CONFIG_KEYS,
  AGG_FN_LABELS,
} from "@/lib/report-builder";
import { Card, EmptyState, Field, Input, Table, buttonClass, cx } from "@/components/ui";
import { listReportPresets, saveReportPreset, deleteReportPreset } from "./actions";
import { FieldsEditor } from "./_fields-editor";
import { FilterModal, type FilterState } from "./_filter-modal";

const FILTER_KEYS = [
  "periodId",
  "dateFrom",
  "dateTo",
  "status",
  "cardQuery",
  "departmentQuery",
  "limit",
] as const;

const STATUSES: ItemStatus[] = ["PENDING", "APPROVED", "REJECTED", "COUPON_CREATED", "COUPON_ISSUED"];

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
 * окно фильтра. Считает через `runBuilderReport` (`lib/report-builder.ts`).
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
  const groupFields = parseGroupFields(sp.g);
  const calcFields = parseCalcFields(sp.c);
  const resolvedGroupFields = groupFields.length ? groupFields : [{ field: "department" as const }];
  const resolvedCalcFields = calcFields.length ? calcFields : [{ agg: "count" as const, label: AGG_FN_LABELS.count }];
  const limit = sp.limit ? Math.max(1, Number.parseInt(sp.limit, 10) || 0) : undefined;
  const status = STATUSES.find((s) => s === sp.status);

  const [periods, presets] = await Promise.all([listPeriodsForBuilder(), listReportPresets()]);

  const result = await runBuilderReport({
    groupFields: resolvedGroupFields,
    calcFields: resolvedCalcFields,
    periodId: sp.periodId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    status,
    cardQuery: sp.cardQuery,
    departmentQuery: sp.departmentQuery,
    limit,
  });

  const resolvedSp: BuilderSearchParams = {
    ...sp,
    g: JSON.stringify(resolvedGroupFields),
    c: JSON.stringify(resolvedCalcFields),
  };
  const fullQuery = toQueryString(resolvedSp, PRESET_CONFIG_KEYS);
  const exportHref = `/admin/reports/builder/export?${fullQuery}`;

  const fieldsRestQuery = toQueryString(sp, FILTER_KEYS);
  const filterRestQuery = toQueryString(resolvedSp, ["g", "c"] as const);
  const filterInitial: FilterState = {
    periodId: sp.periodId ?? "",
    status: sp.status ?? "",
    dateFrom: sp.dateFrom ?? "",
    dateTo: sp.dateTo ?? "",
    cardQuery: sp.cardQuery ?? "",
    departmentQuery: sp.departmentQuery ?? "",
    limit: sp.limit ?? "",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">Конструктор отчётов</h1>
        <Link href="/admin/reports" className={buttonClass({ variant: "secondary", size: "sm" })}>
          К основным отчётам
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">
              Найдено позиций: <b className="text-ink">{result.matchedCount}</b> · строк: {result.rows.length}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <FilterModal basePath="/admin/reports/builder" restQuery={filterRestQuery} periods={periods} initial={filterInitial} />
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
                    <tr className="bg-surface-muted">
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
            groupFields={resolvedGroupFields}
            calcFields={resolvedCalcFields}
          />
        </Card>
      </div>
    </div>
  );
}
