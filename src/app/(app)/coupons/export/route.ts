import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { COUPON_STATUS_LABELS } from "@/lib/coupon";
import { listCouponRegistry, isCouponStatus } from "@/lib/coupon-registry";

const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!can(session.roles, "coupons.manage")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const q = req.nextUrl.searchParams;
  const periodId = q.get("period") || undefined;
  const statusRaw = q.get("status") || "";
  const status = isCouponStatus(statusRaw) ? statusRaw : undefined;
  const partnerId = q.get("partner") || undefined;
  const employeeQuery = q.get("emp") || undefined;

  const coupons = await listCouponRegistry({ periodId, status, partnerId, employeeQuery });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  const ws = wb.addWorksheet("Купоны");
  ws.columns = [
    { header: "Номер", key: "number", width: 20 },
    { header: "Сотрудник", key: "employee", width: 28 },
    { header: "Подразделение", key: "dept", width: 24 },
    { header: "Льгота", key: "card", width: 36 },
    { header: "Партнёр", key: "partner", width: 28 },
    { header: "Период", key: "period", width: 18 },
    { header: "Тип", key: "type", width: 12 },
    { header: "Номинал / условие", key: "nominal", width: 40 },
    { header: "Статус", key: "status", width: 16 },
    { header: "Сформирован", key: "created", width: 14 },
    { header: "Выдан", key: "issued", width: 14 },
    { header: "Действует до", key: "valid", width: 14 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2DCDB" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } };
  });

  for (const c of coupons) {
    ws.addRow({
      number: c.number,
      employee: c.employee.fullName,
      dept: c.employee.department,
      card: c.item.card.title,
      partner: c.partner?.name ?? "",
      period: c.period.name,
      type: c.type,
      nominal: c.nominal ?? "",
      status: COUPON_STATUS_LABELS[c.status],
      created: d(c.createdAt),
      issued: d(c.issuedAt),
      valid: d(c.validUntil),
    });
  }
  ws.autoFilter = { from: "A1", to: "L1" };

  const buffer = await wb.xlsx.writeBuffer();

  await audit({
    actorId: session.user.id,
    action: "COUPON_REGISTRY_EXPORTED",
    entityType: "Coupon",
    entityId: null,
    newValue: { count: coupons.length, period: periodId ?? "all", status: status ?? "all" },
  });

  const filename = `Реестр_купонов${periodId ? "_" + coupons[0]?.period.name.replace(/\s+/g, "_") : ""}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
