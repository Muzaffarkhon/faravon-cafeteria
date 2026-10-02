import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { loadCampaignReport, ANSWER_LABEL, DELIVERY_LABEL } from "@/lib/broadcast-report";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!can(session.roles, "cards.manage")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const report = await loadCampaignReport((await params).id);
  if (!report) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  const confirm = report.campaign.askConfirm;
  const ws = wb.addWorksheet(confirm ? "Ответы" : "Получатели");
  ws.columns = [
    { header: "Сотрудник", key: "name", width: 32 },
    { header: "Подразделение", key: "dept", width: 26 },
    { header: "Должность", key: "pos", width: 26 },
    { header: "Доставка", key: "delivery", width: 18 },
    ...(confirm
      ? [
          { header: "Ответ", key: "answer", width: 12 },
          { header: "Когда ответил", key: "at", width: 20 },
          { header: "Причина «Нет»", key: "reason", width: 60 },
        ]
      : []),
  ];
  ws.getRow(1).font = { bold: true };
  // ?answer=YES|NO|NONE|UNDELIVERED — выгрузка того же среза, что выбран на странице отчёта.
  const answer = req.nextUrl.searchParams.get("answer");
  const rows = report.rows.filter((r) =>
    answer === "YES" || answer === "NO"
      ? r.answer === answer
      : answer === "NONE"
        ? !r.answer
        : answer === "UNDELIVERED"
          ? r.delivery === "BLOCKED" || r.delivery === "FAILED"
          : true,
  );
  for (const r of rows) {
    ws.addRow({
      name: r.fullName,
      dept: r.department,
      pos: r.position,
      delivery: DELIVERY_LABEL[r.delivery],
      answer: r.answer ? ANSWER_LABEL[r.answer] : "Не ответил",
      at: r.answeredAt ? r.answeredAt.toLocaleString("ru-RU", { timeZone: "Asia/Dushanbe" }) : "",
      reason: r.reason ?? "",
    });
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `${confirm ? "Ответы" : "Получатели"}_${report.campaign.title.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60)}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
