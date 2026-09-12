import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import type { Role, EmploymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { EMPLOYMENT_STATUS_LABELS } from "@/lib/labels";
import { audit } from "@/lib/audit";

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FF1E293B" } };
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "medium", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
    cell.alignment = { vertical: "middle" };
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!can(session.roles, "users.manage")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const view = req.nextUrl.searchParams.get("view");
  const isArchive = view === "archive";

  const employees = await db.employee.findMany({
    where: isArchive ? { archivedAt: { not: null } } : { archivedAt: null },
    include: {
      user: {
        select: {
          login: true,
          roles: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Кафетерий льгот «Фаровон»";
  wb.created = new Date();

  const ws = wb.addWorksheet(isArchive ? "Архив сотрудников" : "Сотрудники и доступы");

  ws.columns = [
    { header: "ID", key: "id", width: 26 },
    { header: "ФИО", key: "fullName", width: 34 },
    { header: "Должность", key: "position", width: 28 },
    { header: "Подразделение", key: "department", width: 28 },
    { header: "Телефон", key: "phone", width: 20 },
    { header: "Доп. телефон", key: "phoneSecondary", width: 20 },
    { header: "Логин для входа", key: "login", width: 24 },
    { header: "Статус учётки", key: "userStatus", width: 16 },
    { header: "Роли", key: "roles", width: 22 },
    { header: "Статус работы", key: "empStatus", width: 18 },
    { header: "Telegram ID", key: "telegramId", width: 18 },
  ];

  styleHeader(ws.getRow(1));

  for (const emp of employees) {
    const rolesStr = emp.user?.roles?.length
      ? emp.user.roles.map((r: Role) => ROLE_LABELS[r] ?? r).join(", ")
      : emp.user ? "Сотрудник" : "—";

    const userStatusStr = !emp.user
      ? "Нет логина"
      : !emp.user.isActive
        ? "Заблокирован"
        : emp.user.mustChangePassword
          ? "Требует пароль"
          : "Активен";

    const empStatusLabel =
      EMPLOYMENT_STATUS_LABELS[emp.status as EmploymentStatus] ?? emp.status ?? "Активен";

    const row = ws.addRow({
      id: emp.id,
      fullName: emp.fullName,
      position: emp.position ?? "—",
      department: emp.department ?? "—",
      phone: emp.phone ?? "—",
      phoneSecondary: emp.phoneSecondary ?? "—",
      login: emp.user?.login ?? "—",
      userStatus: userStatusStr,
      roles: rolesStr,
      empStatus: empStatusLabel,
      telegramId: emp.telegramId ?? "—",
    });

    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFF1F5F9" } },
        right: { style: "thin", color: { argb: "FFF1F5F9" } },
      };
      cell.alignment = { vertical: "middle" };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();

  await audit({
    actorId: session.user.id,
    action: "USER_EXPORTED",
    entityType: "Employee",
    newValue: { count: employees.length, isArchive },
  });

  const now = new Date().toISOString().slice(0, 10);
  const filename = `Реестр_сотрудников_${isArchive ? "архив_" : ""}${now}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
