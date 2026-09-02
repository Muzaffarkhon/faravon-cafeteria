"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import type { Role } from "@prisma/client";
import { hashPassword } from "@/lib/password";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { issueOtpForUser } from "@/lib/otp";
import { ALL_ROLES } from "./roles";

function parseRoles(formData: FormData): Role[] {
  const picked = formData.getAll("roles").map(String);
  const roles = ALL_ROLES.filter((r) => picked.includes(r));
  return roles.length ? roles : ["EMPLOYEE"];
}

function normLogin(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim().toLowerCase();
}

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

/* --------------------------------------------------------------- employees --- */

export type EmployeeFormState = {
  error?: string;
  ok?: boolean;
  createdId?: string;
  otp?: string;
  login?: string;
};

type EmployeeInput = {
  tabNumber: string;
  fullName: string;
  position: string;
  department: string;
  phone: string | null;
  telegramId: string | null;
};

function parseEmployee(formData: FormData): EmployeeInput {
  const tabNumber = String(formData.get("tabNumber") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim();
  const department = String(formData.get("department") ?? "").trim();
  if (!tabNumber) throw new Error("Укажите табельный номер.");
  if (!fullName) throw new Error("Укажите ФИО.");
  if (!position) throw new Error("Укажите должность.");
  if (!department) throw new Error("Укажите подразделение.");
  return {
    tabNumber,
    fullName,
    position,
    department,
    phone: str(formData, "phone"),
    telegramId: str(formData, "telegramId"),
  };
}

export async function createEmployee(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  let data: EmployeeInput;
  try {
    data = parseEmployee(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }

  const dup = await db.employee.findUnique({ where: { tabNumber: data.tabNumber } });
  if (dup) return { error: `Табельный номер ${data.tabNumber} уже занят.` };

  const wantAccount = formData.get("createAccount") === "on";
  const login = normLogin(formData.get("login"));
  const roles = parseRoles(formData);

  if (wantAccount) {
    if (!login) return { error: "Укажите логин для учётной записи." };
    if (!/^[a-z0-9._-]{3,}$/.test(login)) {
      return { error: "Логин: минимум 3 символа, латиница/цифры/точка/дефис/подчёркивание." };
    }
    const loginDup = await db.user.findUnique({ where: { login } });
    if (loginDup) return { error: `Логин «${login}» уже занят.` };
  }

  const employee = await db.employee.create({ data });
  await audit({
    actorId: s.user.id,
    action: "EMPLOYEE_CREATED",
    entityType: "Employee",
    entityId: employee.id,
    newValue: { tabNumber: employee.tabNumber, fullName: employee.fullName },
  });

  let otp: string | undefined;
  if (wantAccount) {
    const user = await db.user.create({
      data: {
        login,
        passwordHash: await hashPassword(randomUUID()),
        mustChangePassword: true,
        roles,
        employeeId: employee.id,
      },
    });
    await audit({
      actorId: s.user.id,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      newValue: { login: user.login, roles: user.roles, employeeId: employee.id },
    });
    otp = await issueOtpForUser(user.id, `admin:${s.user.login}`);
  }

  revalidatePath("/admin/users");
  return { ok: true, createdId: employee.id, otp, login: wantAccount ? login : undefined };
}

export async function updateEmployee(
  id: string,
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  const before = await db.employee.findUnique({ where: { id } });
  if (!before) return { error: "Сотрудник не найден." };

  let data: EmployeeInput;
  try {
    data = parseEmployee(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }

  if (data.tabNumber !== before.tabNumber) {
    const dup = await db.employee.findUnique({ where: { tabNumber: data.tabNumber } });
    if (dup) return { error: `Табельный номер ${data.tabNumber} уже занят.` };
  }

  await db.employee.update({ where: { id }, data });
  await audit({
    actorId: s.user.id,
    action: "EMPLOYEE_UPDATED",
    entityType: "Employee",
    entityId: id,
    oldValue: {
      tabNumber: before.tabNumber,
      fullName: before.fullName,
      position: before.position,
      department: before.department,
      phone: before.phone,
      telegramId: before.telegramId,
    },
    newValue: data,
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/access");
  return { ok: true };
}

/* ----------------------------------------------------------------- accounts --- */

export type AccountResult = { error?: string; ok?: boolean; otp?: string };

/** Создать учётную запись для существующего сотрудника. */
export async function createAccountForEmployee(
  employeeId: string,
  formData: FormData,
): Promise<AccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!emp) return { error: "Сотрудник не найден." };
  if (emp.user) return { error: "У сотрудника уже есть учётная запись." };

  const login = normLogin(formData.get("login"));
  if (!/^[a-z0-9._-]{3,}$/.test(login)) {
    return { error: "Логин: минимум 3 символа, латиница/цифры/точка/дефис/подчёркивание." };
  }
  if (await db.user.findUnique({ where: { login } })) {
    return { error: `Логин «${login}» уже занят.` };
  }
  const roles = parseRoles(formData);

  const user = await db.user.create({
    data: {
      login,
      passwordHash: await hashPassword(randomUUID()),
      mustChangePassword: true,
      roles,
      employeeId,
    },
  });
  await audit({
    actorId: s.user.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    newValue: { login: user.login, roles: user.roles, employeeId },
  });
  const otp = await issueOtpForUser(user.id, `admin:${s.user.login}`);

  revalidatePath(`/admin/users/${employeeId}`);
  revalidatePath("/admin/users");
  return { ok: true, otp };
}

/** Создать служебную учётную запись без привязки к сотруднику (согласующий, HR BP и т.п.). */
export async function createServiceAccount(
  _prev: AccountResult,
  formData: FormData,
): Promise<AccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  const login = normLogin(formData.get("login"));
  if (!/^[a-z0-9._-]{3,}$/.test(login)) {
    return { error: "Логин: минимум 3 символа, латиница/цифры/точка/дефис/подчёркивание." };
  }
  if (await db.user.findUnique({ where: { login } })) {
    return { error: `Логин «${login}» уже занят.` };
  }
  const roles = parseRoles(formData);

  const user = await db.user.create({
    data: {
      login,
      passwordHash: await hashPassword(randomUUID()),
      mustChangePassword: true,
      roles,
    },
  });
  await audit({
    actorId: s.user.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    newValue: { login: user.login, roles: user.roles, service: true },
  });
  const otp = await issueOtpForUser(user.id, `admin:${s.user.login}`);

  revalidatePath("/admin/users");
  return { ok: true, otp };
}

export async function setUserRoles(userId: string, roles: Role[]): Promise<AccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  const before = await db.user.findUnique({ where: { id: userId } });
  if (!before) return { error: "Учётная запись не найдена." };

  const next = ALL_ROLES.filter((r) => roles.includes(r));
  if (!next.length) return { error: "Оставьте хотя бы одну роль." };

  if (
    before.roles.includes("SUPERADMIN") &&
    !next.includes("SUPERADMIN") &&
    userId === s.user.id
  ) {
    return { error: "Нельзя снять с себя роль «Суперадмин»." };
  }

  await db.user.update({ where: { id: userId }, data: { roles: next } });
  await audit({
    actorId: s.user.id,
    action: "USER_ROLES_CHANGED",
    entityType: "User",
    entityId: userId,
    oldValue: { roles: before.roles },
    newValue: { roles: next },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setAccountActive(userId: string, active: boolean): Promise<AccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  if (userId === s.user.id && !active) {
    return { error: "Нельзя отключить собственную учётную запись." };
  }
  const before = await db.user.findUnique({ where: { id: userId } });
  if (!before) return { error: "Учётная запись не найдена." };

  await db.user.update({ where: { id: userId }, data: { isActive: active } });
  await audit({
    actorId: s.user.id,
    action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entityType: "User",
    entityId: userId,
    oldValue: { isActive: before.isActive },
    newValue: { isActive: active },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

/** Offboarding (§5.1): деактивация сотрудника — закрывает вход и его учётной записи. */
export async function setEmployeeActive(
  employeeId: string,
  active: boolean,
): Promise<AccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!emp) return { error: "Сотрудник не найден." };
  if (emp.user && emp.user.id === s.user.id) {
    return { error: "Нельзя деактивировать собственную запись." };
  }

  await db.employee.update({
    where: { id: employeeId },
    data: {
      isActive: active,
      status: active ? "ACTIVE" : "TERMINATED",
      terminatedAt: active ? null : new Date(),
    },
  });
  if (emp.user) {
    await db.user.update({ where: { id: emp.user.id }, data: { isActive: active } });
  }
  await audit({
    actorId: s.user.id,
    action: active ? "EMPLOYEE_ACTIVATED" : "EMPLOYEE_DEACTIVATED",
    entityType: "Employee",
    entityId: employeeId,
    newValue: { isActive: active },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${employeeId}`);
  revalidatePath("/admin/access");
  return { ok: true };
}

/** Выдать одноразовый пароль (§5.1). Показывается администратору один раз. */
export async function issuePassword(userId: string): Promise<AccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Учётная запись не найдена." };

  const otp = await issueOtpForUser(user.id, `admin:${s.user.login}`);
  revalidatePath("/admin/users");
  return { ok: true, otp };
}

/* ------------------------------------------------------------ импорт Excel --- */

export type ImportState = {
  error?: string;
  ok?: boolean;
  created?: number;
  updated?: number;
  deactivated?: number;
  rowErrors?: string[];
};

/** Заголовки столбцов файла → ключ поля. Сопоставление без учёта регистра/пробелов. */
const HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  tabNumber: ["табельныйномер", "табельный", "таб.№", "таб№", "табномер", "tabnumber", "personnelnumber"],
  fullName: ["фио", "ф.и.о.", "имя", "сотрудник", "fullname", "name"],
  position: ["должность", "position", "title"],
  department: ["подразделение", "отдел", "department", "unit"],
  phone: ["телефон", "тел", "phone", "mobile"],
  telegramId: ["telegramid", "telegram", "телеграм", "телеграмid", "chatid"],
};

type ImportRow = {
  tabNumber: string;
  fullName: string;
  position: string;
  department: string;
  phone: string | null;
  telegramId: string | null;
};

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v) return String(v.result ?? "").trim();
    if ("richText" in v && Array.isArray(v.richText))
      return v.richText.map((r) => r.text).join("").trim();
    return "";
  }
  return String(v).trim();
}

export async function importEmployees(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Выберите файл .xlsx." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "Файл больше 5 МБ." };
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { error: "Не удалось прочитать файл. Нужен формат .xlsx." };
  }
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) {
    return { error: "В файле нет данных (ожидается строка заголовков и хотя бы одна строка)." };
  }

  // Карта: ключ поля → номер столбца
  const colOf: Partial<Record<keyof ImportRow, number>> = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = norm(cellText(cell.value));
    for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [keyof ImportRow, string[]][]) {
      if (aliases.includes(h) && !colOf[key]) colOf[key] = col;
    }
  });
  if (!colOf.tabNumber || !colOf.fullName) {
    return {
      error:
        "Не найдены обязательные столбцы «Табельный номер» и «ФИО». Скачайте шаблон и заполните его.",
    };
  }

  const rowErrors: string[] = [];
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (key: keyof ImportRow) =>
      colOf[key] ? cellText(row.getCell(colOf[key]!).value) : "";

    const tabNumber = get("tabNumber");
    const fullName = get("fullName");
    if (!tabNumber && !fullName) continue; // пустая строка
    if (!tabNumber || !fullName) {
      rowErrors.push(`Строка ${r}: пропущена — нет табельного номера или ФИО.`);
      continue;
    }
    if (seen.has(tabNumber)) {
      rowErrors.push(`Строка ${r}: табельный номер ${tabNumber} повторяется в файле — пропущена.`);
      continue;
    }
    seen.add(tabNumber);

    const data: ImportRow = {
      tabNumber,
      fullName,
      position: get("position") || "—",
      department: get("department") || "—",
      phone: get("phone") || null,
      telegramId: get("telegramId") || null,
    };

    try {
      const existing = await db.employee.findUnique({ where: { tabNumber } });
      if (existing) {
        await db.employee.update({ where: { tabNumber }, data });
        updated++;
      } else {
        await db.employee.create({ data });
        created++;
      }
    } catch (e) {
      const msg = e instanceof Error && /telegramId/.test(e.message)
        ? `Telegram ID уже привязан к другому сотруднику`
        : "ошибка записи";
      rowErrors.push(`Строка ${r} (${tabNumber}): ${msg}.`);
    }
  }

  let deactivated = 0;
  if (formData.get("deactivateAbsent") === "on" && created + updated > 0) {
    const absent = await db.employee.findMany({
      where: { isActive: true, tabNumber: { notIn: [...seen] } },
      include: { user: true },
    });
    for (const emp of absent) {
      await db.employee.update({
        where: { id: emp.id },
        data: { isActive: false, status: "TERMINATED", terminatedAt: new Date() },
      });
      if (emp.user) await db.user.update({ where: { id: emp.user.id }, data: { isActive: false } });
      deactivated++;
    }
  }

  await audit({
    actorId: s.user.id,
    action: "EMPLOYEES_IMPORTED",
    entityType: "Employee",
    newValue: { created, updated, deactivated, rows: seen.size, file: file.name },
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/access");
  return { ok: true, created, updated, deactivated, rowErrors };
}
