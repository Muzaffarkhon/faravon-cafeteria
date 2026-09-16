import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import type { ItemStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { DIMENSION_LABELS, MEASURE_LABELS, runPivotReport, type PivotDimension, type PivotMeasure } from "@/lib/report-builder";

const DIMENSIONS: PivotDimension[] = ["department", "card", "partner", "status", "period", "day", "month"];
const MEASURES: PivotMeasure[] = ["count", "employees"];
const STATUSES: ItemStatus[] = ["PENDING", "APPROVED", "REJECTED", "COUPON_CREATED", "COUPON_ISSUED"];

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2DCDB" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } };
  });
}

/** Экспорт текущего среза «Конструктора отчётов» — тот же срез, что и на экране (searchParams как есть). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!can(session.roles, "reports.view")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const dimension = DIMENSIONS.find((d) => d === sp.get("dimension")) ?? "department";
  const columnDimension = DIMENSIONS.find((d) => d === sp.get("columnDimension") && d !== dimension);
  const measure = MEASURES.find((m) => m === sp.get("measure")) ?? "count";
  const status = STATUSES.find((s) => s === sp.get("status"));
  const topNRaw = sp.get("topN");
  const topN = topNRaw ? Math.max(1, Number.parseInt(topNRaw, 10) || 0) : undefined;

  const { rows, total, matrix } = await runPivotReport({
    dimension,
    columnDimension,
    measure,
    periodId: sp.get("periodId") ?? undefined,
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    status,
    cardQuery: sp.get("cardQuery") ?? undefined,
    departmentQuery: sp.get("departmentQuery") ?? undefined,
    topN,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  wb.created = new Date();

  const rowLabel = DIMENSION_LABELS[dimension];
  const measureLabel = MEASURE_LABELS[measure];

  if (matrix) {
    const colLabel = DIMENSION_LABELS[columnDimension!];
    const sheet = wb.addWorksheet("Сводная таблица");
    sheet.columns = [
      { header: `${rowLabel} \\ ${colLabel}`, key: "row", width: 32 },
      ...matrix.columnLabels.map((c, i) => ({ header: c, key: `c${i}`, width: 16 })),
      { header: "Итого", key: "total", width: 14 },
    ];
    styleHeader(sheet.getRow(1));
    matrix.rowLabels.forEach((r, i) => {
      const record: Record<string, string | number> = { row: r, total: matrix.rowTotals[i] };
      matrix.columnLabels.forEach((_, j) => {
        record[`c${j}`] = matrix.cells[i][j];
      });
      sheet.addRow(record);
    });
    const totalsRecord: Record<string, string | number> = { row: "Итого", total: matrix.grandTotal };
    matrix.columnLabels.forEach((_, j) => {
      totalsRecord[`c${j}`] = matrix.columnTotals[j];
    });
    const totalsRow = sheet.addRow(totalsRecord);
    totalsRow.font = { bold: true };
  } else {
    const sheet = wb.addWorksheet("Отчёт");
    sheet.columns = [
      { header: rowLabel, key: "label", width: 40 },
      { header: measureLabel, key: "value", width: 18 },
      { header: "Доля", key: "share", width: 12 },
    ];
    styleHeader(sheet.getRow(1));
    rows.forEach((r) =>
      sheet.addRow({ label: r.label, value: r.value, share: total ? `${((r.value / total) * 100).toFixed(1)}%` : "" }),
    );
    const totalRow = sheet.addRow({ label: "Итого", value: total, share: "" });
    totalRow.font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();

  await audit({
    actorId: session.user.id,
    action: "REPORT_BUILDER_EXPORTED",
    entityType: "ReportBuilder",
    entityId: dimension,
    newValue: { dimension, columnDimension: columnDimension ?? null, measure },
  });

  const filename = `Конструктор_отчётов_${rowLabel}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
