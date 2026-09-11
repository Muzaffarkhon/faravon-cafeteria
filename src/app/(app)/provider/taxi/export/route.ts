import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { taxiRecipientsForPartner } from "@/lib/taxi";

/**
 * Выгрузка номеров одобренных сотрудников для подрядчика такси (§5):
 * один файл, чтобы быстро завести промокоды в своей системе.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!can(session.roles, "promo.broadcast")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const partnerId = session.user.partnerId;
  if (!partnerId) return NextResponse.json({ error: "NO_PARTNER" }, { status: 400 });

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { name: true, deliveryMode: true },
  });
  if (partner?.deliveryMode !== "PHONE_PROMO") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const recipients = await taxiRecipientsForPartner(partnerId);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  const ws = wb.addWorksheet("Номера");
  ws.columns = [
    { header: "Сотрудник", key: "employee", width: 28 },
    { header: "Подразделение", key: "dept", width: 24 },
    { header: "Телефон", key: "phone", width: 20 },
    { header: "Льгота", key: "card", width: 32 },
    { header: "Период", key: "period", width: 18 },
    { header: "Одобрено", key: "approved", width: 14 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2DCDB" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } };
  });

  for (const r of recipients) {
    ws.addRow({
      employee: r.employee,
      dept: r.department,
      phone: r.phone,
      card: r.card,
      period: r.period,
      approved: r.approvedAt ? r.approvedAt.toISOString().slice(0, 10) : "",
    });
  }
  ws.autoFilter = { from: "A1", to: "F1" };

  const buffer = await wb.xlsx.writeBuffer();

  await audit({
    actorId: session.user.id,
    action: "TAXI_NUMBERS_EXPORTED",
    entityType: "Partner",
    entityId: partnerId,
    newValue: { count: recipients.length },
  });

  const filename = `Номера_${(partner.name || "такси").replace(/\s+/g, "_")}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
