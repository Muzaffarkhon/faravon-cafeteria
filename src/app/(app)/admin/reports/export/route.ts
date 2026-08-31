import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { computeReport } from "@/lib/reports";

const num1 = (v: number | null) => (v == null ? "" : Math.round(v * 10) / 10);
const pct1 = (v: number | null) => (v == null ? "" : `${Math.round(v * 10) / 10}%`);

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2DCDB" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } };
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!can(session.roles, "reports.view")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const periodId = req.nextUrl.searchParams.get("period") ?? "";
  const report = await computeReport(periodId);
  if (!report) return NextResponse.json({ error: "PERIOD_NOT_FOUND" }, { status: 404 });

  const k = report.kpis;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  wb.created = report.period.startDate;

  // --- Метрики ---
  const s1 = wb.addWorksheet("Метрики");
  s1.columns = [
    { header: "Показатель", key: "m", width: 42 },
    { header: "Значение", key: "v", width: 16 },
    { header: "Пояснение", key: "h", width: 48 },
  ];
  styleHeader(s1.getRow(1));
  const metricRows: [string, string | number, string][] = [
    ["Период", report.period.name, ""],
    ["Активация", pct1(k.activationPct), `${k.everLoggedIn} из ${k.accounts} вошли хотя бы раз`],
    ["Вовлечение", pct1(k.engagementPct), `${k.engagedLoggedIn} из ${k.everLoggedIn} вошедших выбрали ≥ 1 льготу`],
    ["Льгот на активного сотрудника", num1(k.avgSelectionsPerActive), `${k.activeEmployees} активных в периоде`],
    ["Конверсия заявка → купон", pct1(k.conversionPct), `${k.issued} из ${k.submitted} поданных`],
    ["Доля отклонений", pct1(k.rejectionPct), `${k.rejected} из ${k.decided} решений`],
    ["Среднее время до решения, дн.", num1(k.avgDecisionDays), `p90: ${num1(k.p90DecisionDays)}`],
    ["Среднее время до выдачи купона, дн.", num1(k.avgIssueDays), `p90: ${num1(k.p90IssueDays)}`],
    ["Нарушения SLA согласования", pct1(k.slaBreachPct), `${k.slaBreached} позиций (порог 5 дн.)`],
  ];
  metricRows.forEach((r) => s1.addRow({ m: r[0], v: r[1], h: r[2] }));

  // --- Топ льгот ---
  const s2 = wb.addWorksheet("Топ льгот");
  s2.columns = [
    { header: "Льгота", key: "t", width: 44 },
    { header: "Выборов", key: "s", width: 12 },
    { header: "Одобрено", key: "a", width: 12 },
  ];
  styleHeader(s2.getRow(1));
  const approvals = new Map(report.topApprovals.map((r) => [r.title, r.n]));
  report.topSelections.forEach((r) => s2.addRow({ t: r.title, s: r.n, a: approvals.get(r.title) ?? 0 }));

  // --- Отклонения ---
  const s3 = wb.addWorksheet("Отклонения");
  s3.columns = [
    { header: "Причина", key: "r", width: 60 },
    { header: "Количество", key: "n", width: 14 },
  ];
  styleHeader(s3.getRow(1));
  report.rejectionsByReason.forEach((r) => s3.addRow({ r: r.reason, n: r.n }));

  // --- Подразделения ---
  const s4 = wb.addWorksheet("Подразделения");
  s4.columns = [
    { header: "Подразделение", key: "d", width: 36 },
    { header: "Сотрудников", key: "e", width: 14 },
    { header: "Позиций", key: "i", width: 12 },
  ];
  styleHeader(s4.getRow(1));
  report.byDepartment.forEach((r) => s4.addRow({ d: r.department, e: r.employees, i: r.items }));

  const buffer = await wb.xlsx.writeBuffer();

  await audit({
    actorId: session.user.id,
    action: "REPORT_EXPORTED",
    entityType: "Period",
    entityId: periodId,
    newValue: { format: "xlsx" },
  });

  const filename = `Отчёт_${report.period.name.replace(/\s+/g, "_")}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
