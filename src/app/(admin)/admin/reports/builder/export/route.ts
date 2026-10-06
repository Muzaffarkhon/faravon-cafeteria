import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { dushanbeIsoDate, fmtDateTimeShort } from "@/lib/dushanbe-date";
import {
  DATASET_LABELS,
  configFromParams,
  describeCondition,
  listReportOptions,
  runBuilderReportCompared,
  fieldMeta,
} from "@/lib/report-builder";

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
  const cfg = configFromParams((k) => sp.get(k));
  const [{ result, compareNote }, options] = await Promise.all([runBuilderReportCompared(cfg), listReportOptions(cfg.dataset)]);

  const now = new Date();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  wb.created = now;

  const sheet = wb.addWorksheet("Отчёт");
  sheet.columns = result.columns.map((c) => ({ header: c.label, key: c.key, width: c.numeric ? 18 : 32 }));
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  result.rows.forEach((r) => sheet.addRow(r));
  if (result.totals) {
    const totalsRecord: Record<string, string | number> = {};
    result.columns.forEach((c, i) => {
      totalsRecord[c.key] = i === 0 ? "Итого" : (result.totals![c.key] ?? "");
    });
    sheet.addRow(totalsRecord).font = { bold: true };
  }

  const optionLabel = (field: string, value: string) => {
    const meta = fieldMeta(cfg.dataset, field);
    return (meta?.options ?? options[field] ?? []).find((o) => o.value === value)?.label ?? value;
  };
  const info = wb.addWorksheet("Условия");
  info.columns = [
    { header: "Параметр", key: "k", width: 26 },
    { header: "Значение", key: "v", width: 80 },
  ];
  styleHeader(info.getRow(1));
  info.addRow({ k: "Источник данных", v: DATASET_LABELS[cfg.dataset] });
  info.addRow({ k: "Сформирован (Душанбе)", v: fmtDateTimeShort(now) });
  info.addRow({ k: "Записей в выборке", v: result.matchedCount });
  if (cfg.limit) info.addRow({ k: "Ограничение строк", v: cfg.limit });
  if (compareNote) info.addRow({ k: "Сравнение", v: compareNote });
  if (cfg.conditions.length === 0) info.addRow({ k: "Условия", v: "нет" });
  cfg.conditions.forEach((c, i) => info.addRow({ k: `Условие ${i + 1}`, v: describeCondition(cfg.dataset, c, optionLabel) }));

  const buffer = await wb.xlsx.writeBuffer();

  await audit({
    actorId: session.user.id,
    action: "REPORT_BUILDER_EXPORTED",
    entityType: "ReportBuilder",
    entityId: cfg.groupFields.map((g) => g.field).join(","),
    newValue: { dataset: cfg.dataset, groupFields: cfg.groupFields, calcFields: cfg.calcFields, conditions: cfg.conditions },
  });

  const filename = `Конструктор_отчётов_${dushanbeIsoDate(now)}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
