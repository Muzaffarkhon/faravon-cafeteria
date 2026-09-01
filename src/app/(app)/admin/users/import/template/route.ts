import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!can(session.roles, "users.manage")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  const ws = wb.addWorksheet("Сотрудники");
  ws.columns = [
    { header: "Табельный номер", key: "tab", width: 18 },
    { header: "ФИО", key: "fio", width: 34 },
    { header: "Должность", key: "pos", width: 26 },
    { header: "Подразделение", key: "dep", width: 26 },
    { header: "Телефон", key: "phone", width: 20 },
    { header: "Telegram ID", key: "tg", width: 16 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2DCDB" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } };
  });
  ws.addRow({
    tab: "0001",
    fio: "Иванов Иван Иванович",
    pos: "Менеджер по продажам",
    dep: "Коммерческий отдел",
    phone: "+992 900 111 001",
    tg: "",
  });

  const buffer = await wb.xlsx.writeBuffer();
  const filename = "Шаблон_импорта_сотрудников.xlsx";
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
