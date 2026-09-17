import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import type { ItemStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { parseGroupFields, parseCalcFields, runBuilderReport, AGG_FN_LABELS } from "@/lib/report-builder";

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
  const groupFields = parseGroupFields(sp.get("g"));
  const calcFields = parseCalcFields(sp.get("c"));
  const resolvedGroupFields = groupFields.length ? groupFields : [{ field: "department" as const }];
  const resolvedCalcFields = calcFields.length ? calcFields : [{ agg: "count" as const, label: AGG_FN_LABELS.count }];
  const status = STATUSES.find((s) => s === sp.get("status"));
  const limitRaw = sp.get("limit");
  const limit = limitRaw ? Math.max(1, Number.parseInt(limitRaw, 10) || 0) : undefined;

  const result = await runBuilderReport({
    groupFields: resolvedGroupFields,
    calcFields: resolvedCalcFields,
    periodId: sp.get("periodId") ?? undefined,
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    status,
    cardQuery: sp.get("cardQuery") ?? undefined,
    departmentQuery: sp.get("departmentQuery") ?? undefined,
    limit,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Отчёт");
  sheet.columns = result.columns.map((c) => ({ header: c.label, key: c.key, width: c.numeric ? 18 : 32 }));
  styleHeader(sheet.getRow(1));
  result.rows.forEach((r) => sheet.addRow(r));
  if (result.totals) {
    const totalsRecord: Record<string, string | number> = {};
    result.columns.forEach((c, i) => {
      totalsRecord[c.key] = i === 0 ? "Итого" : c.numeric ? (result.totals![c.key] ?? "") : "";
    });
    const totalsRow = sheet.addRow(totalsRecord);
    totalsRow.font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();

  await audit({
    actorId: session.user.id,
    action: "REPORT_BUILDER_EXPORTED",
    entityType: "ReportBuilder",
    entityId: resolvedGroupFields.map((g) => g.field).join(","),
    newValue: { groupFields: resolvedGroupFields, calcFields: resolvedCalcFields },
  });

  const filename = "Конструктор_отчётов.xlsx";
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
