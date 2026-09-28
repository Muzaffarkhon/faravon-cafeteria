import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { loadCampaignReport, ANSWER_LABEL } from "@/lib/broadcast-report";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!can(session.roles, "cards.manage")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const report = await loadCampaignReport((await params).id);
  if (!report) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  const ws = wb.addWorksheet("Ответы");
  ws.columns = [
    { header: "Сотрудник", key: "name", width: 32 },
    { header: "Подразделение", key: "dept", width: 26 },
    { header: "Должность", key: "pos", width: 26 },
    { header: "Ответ", key: "answer", width: 12 },
    { header: "Когда ответил", key: "at", width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of report.rows) {
    ws.addRow({
      name: r.fullName,
      dept: r.department,
      pos: r.position,
      answer: r.answer ? ANSWER_LABEL[r.answer] : "Не ответил",
      at: r.answeredAt ? r.answeredAt.toLocaleString("ru-RU", { timeZone: "Asia/Dushanbe" }) : "",
    });
  }
  ws.autoFilter = { from: "A1", to: "E1" };

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `Ответы_${report.campaign.title.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60)}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
