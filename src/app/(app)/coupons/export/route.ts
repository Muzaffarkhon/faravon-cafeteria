import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { COUPON_STATUS_LABELS } from "@/lib/coupon";
import type { BenefitMode } from "@prisma/client";
import { listCouponRegistry, buildCouponFilters, listTaxiRegistryRows } from "@/lib/coupon-registry";
import type { PromoStatus } from "@/lib/taxi";
import { TIMEZONE, dushanbeIsoDate } from "@/lib/dushanbe-date";

const TAXI_STATUS_LABELS: Record<PromoStatus, string> = {
  NONE: "Промокод не отправлен",
  PENDING: "Промокод отправляется",
  DELIVERED: "Промокод доставлен",
  BLOCKED: "Не доставлен (бот заблокирован)",
};

const MODE_LABELS: Record<BenefitMode, string> = { ONE_TIME: "Одноразовый", PERIOD: "Многоразовый", CASHBACK: "Кешбек" };
const CHANNEL_LABELS: Record<string, string> = { PORTAL: "Портал" };

const d = (v: Date | null | undefined) => (v ? dushanbeIsoDate(v) : "");
const dt = (v: Date | null | undefined) =>
  v ? v.toLocaleString("sv-SE", { timeZone: TIMEZONE }).slice(0, 16) : "";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!can(session.roles, "coupons.manage")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const cf = buildCouponFilters(sp);
  const { periodId, status, extraWhere } = cf;
  const [coupons, taxiRows] = await Promise.all([
    listCouponRegistry({ extraWhere }),
    listTaxiRegistryRows(cf),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  const ws = wb.addWorksheet("Купоны");
  ws.columns = [
    { header: "ID", key: "seq", width: 8 },
    { header: "Номер", key: "number", width: 20 },
    { header: "Сотрудник", key: "employee", width: 28 },
    { header: "Подразделение", key: "dept", width: 24 },
    { header: "Льгота", key: "card", width: 36 },
    { header: "Партнёр", key: "partner", width: 28 },
    { header: "Период", key: "period", width: 18 },
    { header: "Выдача", key: "type", width: 22 },
    { header: "Вид использования", key: "mode", width: 18 },
    { header: "Кешбек, %", key: "cashback", width: 11 },
    { header: "Канал доставки", key: "channel", width: 16 },
    { header: "Номинал / условие", key: "nominal", width: 40 },
    { header: "Статус", key: "status", width: 16 },
    { header: "Сформирован", key: "created", width: 14 },
    { header: "Выдан", key: "issued", width: 18 },
    { header: "Активирован", key: "activated", width: 18 },
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
      seq: c.seq,
      number: c.number,
      employee: c.employee.fullName,
      dept: c.employee.department,
      card: c.item.card.title,
      partner: c.partner?.name ?? "",
      period: c.period.name,
      type: c.partner?.deliveryMode === "PHONE_PROMO" ? "По номеру телефона" : "По QR-купону",
      mode: MODE_LABELS[c.benefitMode],
      channel: CHANNEL_LABELS[c.deliveryChannel] ?? c.deliveryChannel,
      cashback: c.benefitMode === "CASHBACK" ? (c.cashbackPercent ?? "") : "",
      nominal: c.nominal ?? "",
      status: COUPON_STATUS_LABELS[c.status],
      created: d(c.createdAt),
      issued: dt(c.issuedAt),
      activated: dt(c.activatedAt),
      valid: d(c.validUntil),
    });
  }
  for (const r of taxiRows) {
    ws.addRow({
      seq: r.seq,
      number: r.promo ?? "",
      employee: r.employee,
      card: r.cardTitle,
      partner: r.partnerName ?? "",
      period: r.periodName,
      type: "По номеру телефона",
      status: TAXI_STATUS_LABELS[r.promoStatus],
      issued: d(r.decidedAt),
      valid: d(r.periodEndDate),
    });
  }
  ws.autoFilter = { from: "A1", to: "Q1" };

  const buffer = await wb.xlsx.writeBuffer();

  await audit({
    actorId: session.user.id,
    action: "COUPON_REGISTRY_EXPORTED",
    entityType: "Coupon",
    entityId: null,
    newValue: { count: coupons.length + taxiRows.length, period: periodId ?? "all", status: status ?? "all" },
  });

  const filename = `Реестр_купонов${periodId ? "_" + (coupons[0]?.period.name ?? taxiRows[0]?.periodName ?? "").replace(/\s+/g, "_") : ""}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
