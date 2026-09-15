import Link from "next/link";
import { redirect } from "next/navigation";
import type { ItemStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  DIMENSION_LABELS,
  MEASURE_LABELS,
  listPeriodsForBuilder,
  runPivotReport,
  type PivotDimension,
  type PivotMeasure,
} from "@/lib/report-builder";
import { BarChartCard } from "@/components/charts";
import { Card, EmptyState, Field, Input, Select, Table, buttonClass } from "@/components/ui";

const DIMENSIONS: PivotDimension[] = ["department", "card", "partner", "status", "period", "day"];
const MEASURES: PivotMeasure[] = ["count", "employees"];
const STATUSES: { value: ItemStatus; label: string }[] = [
  { value: "PENDING", label: "На согласовании" },
  { value: "APPROVED", label: "Одобрено" },
  { value: "REJECTED", label: "Отклонено" },
  { value: "COUPON_CREATED", label: "Купон сформирован" },
  { value: "COUPON_ISSUED", label: "Купон выдан" },
];

/**
 * Конструктор сводных отчётов: свободная группировка (подразделение, льгота,
 * партнёр, статус, период, день) + агрегация (количество / уникальные
 * сотрудники) + фильтр по периоду, дате подачи, статусу, названию льготы и
 * подразделению + ограничение топ-N. Считает через `runPivotReport`
 * (`lib/report-builder.ts`).
 */
export default async function ReportBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{
    dimension?: string;
    measure?: string;
    periodId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    cardQuery?: string;
    departmentQuery?: string;
    topN?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "reports.view")) redirect("/");

  const sp = await searchParams;
  const dimension = DIMENSIONS.find((d) => d === sp.dimension) ?? "department";
  const measure = MEASURES.find((m) => m === sp.measure) ?? "count";
  const status = STATUSES.find((s) => s.value === sp.status)?.value;
  const topN = sp.topN ? Math.max(1, Number.parseInt(sp.topN, 10) || 0) : undefined;

  const periods = await listPeriodsForBuilder();

  const { rows, total } = await runPivotReport({
    dimension,
    measure,
    periodId: sp.periodId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    status,
    cardQuery: sp.cardQuery,
    departmentQuery: sp.departmentQuery,
    topN,
  });

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
          <Field label="Группировка">
            <Select name="dimension" defaultValue={dimension}>
              {DIMENSIONS.map((d) => (
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
          <Field label="Топ-N (пусто — все)">
            <Input type="number" min={1} name="topN" defaultValue={sp.topN ?? ""} placeholder="например, 10" />
          </Field>
          <div className="flex items-end">
            <button className={buttonClass({ size: "sm" })}>Построить отчёт</button>
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState>Нет данных по заданным условиям.</EmptyState>
      ) : (
        <>
          <BarChartCard
            title={`${DIMENSION_LABELS[dimension]} · ${MEASURE_LABELS[measure]}`}
            unit={`итого: ${total}`}
            rows={rows.slice(0, 20)}
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
