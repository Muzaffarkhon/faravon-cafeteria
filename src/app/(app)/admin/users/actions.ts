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
import { normalizePhone, parsePhoneNumbers } from "@/lib/phone";
import { ALL_ROLES } from "./roles";

/** Данные сотрудника + производные `phoneNormalized` и `phoneSecondaryNormalized` для indexed-поиска при входе через Telegram. */
function withPhoneNormalized<T extends { phone: string | null; phoneSecondary?: string | null }>(d: T) {
  return {
    ...d,
    phoneNormalized: d.phone ? normalizePhone(d.phone) : null,
    phoneSecondaryNormalized: d.phoneSecondary ? normalizePhone(d.phoneSecondary) : null,
  };
}

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
  fullName: string;
  position: string;
  department: string;
  phone: string | null;
  phoneSecondary: string | null;
  telegramId: string | null;
};

function parseEmployee(formData: FormData): EmployeeInput {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim();
  const department = String(formData.get("department") ?? "").trim();
  if (!fullName) throw new Error("Укажите ФИО.");
  // Буквы кириллицы (вкл. таджикские ғ ӣ қ ӯ ҳ ҷ), латиницы, пробел, дефис, апостроф, точка.
  if (!/^[A-Za-zА-Яа-яЁёҒғӢӣҚқӮӯҲҳҶҷ][A-Za-zА-Яа-яЁёҒғӢӣҚқӮӯҲҳҶҷ .'-]{1,}$/.test(fullName)) {
    throw new Error("ФИО: только буквы (в т.ч. таджикские), пробел, дефис и апостроф.");
  }
  if (!position) throw new Error("Укажите должность.");
  if (!department) throw new Error("Укажите подразделение.");
  return {
    fullName,
    position,
    department,
    phone: str(formData, "phone"),
    phoneSecondary: str(formData, "phoneSecondary"),
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

  const employee = await db.employee.create({ data: withPhoneNormalized(data) });
  await audit({
    actorId: s.user.id,
    action: "EMPLOYEE_CREATED",
    entityType: "Employee",
    entityId: employee.id,
    newValue: { fullName: employee.fullName, position: employee.position },
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
    otp = await issueOtpForUser(user.id, `admin:${s.user.login}`, s.user.id);
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

  await db.employee.update({ where: { id }, data: withPhoneNormalized(data) });
  await audit({
    actorId: s.user.id,
    action: "EMPLOYEE_UPDATED",
    entityType: "Employee",
    entityId: id,
    oldValue: {
      fullName: before.fullName,
      position: before.position,
      department: before.department,
      phone: before.phone,
      phoneSecondary: before.phoneSecondary,
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
  if (roles.includes("CONTRACTOR")) {
    return { error: "Сотрудник компании не может иметь сервисную роль «Подрядчик»." };
  }

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
  const otp = await issueOtpForUser(user.id, `admin:${s.user.login}`, s.user.id);

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
  if (roles.includes("CONTRACTOR") && roles.length > 1) {
    return {
      error: "Роль «Подрядчик» является сервисной и не может совмещаться с другими ролями.",
    };
  }

  // Привязка к партнёру — только для подрядчика; гасит купоны только своего партнёра.
  const partnerIdRaw = String(formData.get("partnerId") ?? "").trim();
  let partnerId: string | null = null;
  if (partnerIdRaw) {
    if (!roles.includes("CONTRACTOR")) {
      return { error: "Партнёра можно привязать только к учётной записи с ролью «Подрядчик»." };
    }
    if (!(await db.partner.findUnique({ where: { id: partnerIdRaw } }))) {
      return { error: "Выбранный партнёр не найден." };
    }
    partnerId = partnerIdRaw;
  }

  const user = await db.user.create({
    data: {
      login,
      passwordHash: await hashPassword(randomUUID()),
      mustChangePassword: true,
      roles,
      partnerId,
    },
  });
  await audit({
    actorId: s.user.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    newValue: { login: user.login, roles: user.roles, service: true, partnerId },
  });
  const otp = await issueOtpForUser(user.id, `admin:${s.user.login}`, s.user.id);

  revalidatePath("/admin/users");
  return { ok: true, otp };
}

/** Привязать/отвязать служебную учётную запись подрядчика от партнёра. */
export async function setServicePartner(
  userId: string,
  partnerId: string | null,
): Promise<AccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  const before = await db.user.findUnique({ where: { id: userId } });
  if (!before) return { error: "Учётная запись не найдена." };
  if (partnerId && !before.roles.includes("CONTRACTOR")) {
    return { error: "Партнёра можно привязать только к роли «Подрядчик»." };
  }
  if (partnerId && !(await db.partner.findUnique({ where: { id: partnerId } }))) {
    return { error: "Выбранный партнёр не найден." };
  }

  await db.user.update({ where: { id: userId }, data: { partnerId } });
  await audit({
    actorId: s.user.id,
    action: "USER_PARTNER_CHANGED",
    entityType: "User",
    entityId: userId,
    oldValue: { partnerId: before.partnerId },
    newValue: { partnerId },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserRoles(userId: string, roles: Role[]): Promise<AccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  const before = await db.user.findUnique({ where: { id: userId } });
  if (!before) return { error: "Учётная запись не найдена." };

  const next = ALL_ROLES.filter((r) => roles.includes(r));
  if (!next.length) return { error: "Оставьте хотя бы одну роль." };

  if (next.includes("CONTRACTOR") && next.length > 1) {
    return {
      error: "Роль «Подрядчик» является сервисной и не может совмещаться с другими ролями.",
    };
  }

  if (before.employeeId && next.includes("CONTRACTOR")) {
    return {
      error: "Учётная запись сотрудника не может иметь роль «Подрядчик».",
    };
  }

  if (before.roles.includes("C_AND_B") && !next.includes("C_AND_B")) {
    if (userId === s.user.id) {
      return { error: "Нельзя снять с себя роль «C&B»." };
    }
    const otherAdmins = await db.user.count({
      where: {
        id: { not: userId },
        isActive: true,
        roles: { has: "C_AND_B" },
      },
    });
    if (otherAdmins === 0) {
      return {
        error: "Это единственная активная учётная запись с ролью «C&B» — снять её нельзя.",
      };
    }
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
      // уволенный уходит в архив, возвращённый — обратно в активный список
      archivedAt: active ? null : new Date(),
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

/** Архив: убрать сотрудника из основного списка (или вернуть). История сохраняется. */
export async function setEmployeeArchived(
  employeeId: string,
  archived: boolean,
): Promise<AccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "users.manage");

  const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!emp) return { error: "Сотрудник не найден." };
  if (emp.user && emp.user.id === s.user.id) {
    return { error: "Нельзя архивировать собственную запись." };
  }

  await db.employee.update({
    where: { id: employeeId },
    data: { archivedAt: archived ? new Date() : null },
  });
  // Архивной записи вход не нужен; при восстановлении вход включает администратор отдельно.
  if (archived && emp.user?.isActive) {
    await db.user.update({ where: { id: emp.user.id }, data: { isActive: false } });
  }
  await audit({
    actorId: s.user.id,
    action: archived ? "EMPLOYEE_ARCHIVED" : "EMPLOYEE_RESTORED",
    entityType: "Employee",
    entityId: employeeId,
    newValue: { archivedAt: archived },
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

  const otp = await issueOtpForUser(user.id, `admin:${s.user.login}`, s.user.id);
  await audit({
    actorId: s.user.id,
    action: "PASSWORD_ISSUED_BY_ADMIN",
    entityType: "User",
    entityId: user.id,
    newValue: { adminLogin: s.user.login },
  });
  revalidatePath("/admin/users");
  return { ok: true, otp };
}

/* ------------------------------------------------------------ импорт Excel --- */

export type ImportState = {
  error?: string;
  ok?: boolean;
  dryRun?: boolean;
  created?: number;
  updated?: number;
  deactivated?: number;
  deactivateList?: string[];
  rowErrors?: string[];
};


type ImportRow = {
  fullName: string;
  position: string;
  department: string;
  phone: string | null;
  phoneSecondary: string | null;
  telegramId: string | null;
};

type ColKey = keyof ImportRow | "phoneWork" | "phoneCandidate" | "phoneHome";

/** Заголовки столбцов файла → ключ поля. Сопоставление без учёта регистра/пробелов. */
const HEADER_ALIASES: Record<ColKey, string[]> = {
  fullName: ["фио", "ф.и.о.", "имя", "сотрудник", "fullname", "name", "фио(полное)", "фиополное"],
  position: ["должность", "position", "title"],
  department: ["подразделение", "отдел", "department", "unit"],
  phone: ["телефон", "тел", "phone", "mobile", "телефоны"],
  phoneWork: [
    "сотрудник.физлицо.телефонфиз.лицаслужебный",
    "телефонслужебный",
    "служебныйтелефон",
    "служебный",
  ],
  phoneCandidate: [
    "сотрудник.физлицо.контактнтелефонкандидата",
    "контактнтелефонкандидата",
    "контактныйтелефонкандидата",
    "телефонкандидата",
    "кандидат",
  ],
  phoneHome: [
    "сотрудник.физлицо.телефонфиз.лицадомашний",
    "телефондомашний",
    "домашнийтелефон",
    "домашний",
  ],
  phoneSecondary: ["дополнительныйтелефон", "второйтелефон", "доптелефон", "secondaryphone"],
  telegramId: ["telegramid", "telegram", "телеграм", "телеграмid", "chatid"],
};

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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
  const colOf: Partial<Record<ColKey, number>> = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = norm(cellText(cell.value));
    for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [ColKey, string[]][]) {
      if (aliases.includes(h) && !colOf[key]) colOf[key] = col;
    }
  });
  if (!colOf.fullName) {
    return {
      error: "Не найден обязательный столбец «ФИО». Скачайте шаблон и заполните его.",
    };
  }

  const dryRun = formData.get("dryRun") === "on";
  const wantDeactivate = formData.get("deactivateAbsent") === "on";
  const rowErrors: string[] = [];

  // 1) Один запрос — все существующие сотрудники (для сопоставления в памяти).
  const existing = await db.employee.findMany({
    select: {
      id: true,
      fullName: true,
      position: true,
      department: true,
      phone: true,
      phoneSecondary: true,
      isActive: true,
      telegramId: true,
    },
  });
  const byName = new Map<string, (typeof existing)[number]>();
  const tgOwner = new Map<string, string>(); // telegramId -> employeeId
  for (const e of existing) {
    byName.set(norm(e.fullName), e);
    if (e.telegramId) tgOwner.set(e.telegramId, e.id);
  }

  // 2) Разбор всех строк файла в память.
  const seenNames = new Set<string>();
  const tgInFile = new Set<string>();
  const toCreate: ImportRow[] = [];
  const toUpdate: { id: string; data: ImportRow }[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (key: ColKey) =>
      colOf[key] ? cellText(row.getCell(colOf[key]!).value) : "";

    const fullName = get("fullName");
    if (!fullName) continue; // пустая строка
    const nameKey = norm(fullName);
    if (seenNames.has(nameKey)) {
      rowErrors.push(`Строка ${r}: ФИО «${fullName}» повторяется в файле — пропущена.`);
      continue;
    }
    seenNames.add(nameKey);

    const prev = byName.get(nameKey);

    let telegramId = get("telegramId") || null;
    if (telegramId) {
      const owner = tgOwner.get(telegramId);
      if (tgInFile.has(telegramId) || (owner && owner !== prev?.id)) {
        rowErrors.push(
          `Строка ${r} («${fullName}»): Telegram ID уже привязан к другому — импортирован без него.`,
        );
        telegramId = null;
      } else {
        tgInFile.add(telegramId);
      }
    }

    const rawPhoneList: string[] = [];
    if (colOf.phone) rawPhoneList.push(cellText(row.getCell(colOf.phone).value));
    if (colOf.phoneWork) rawPhoneList.push(cellText(row.getCell(colOf.phoneWork).value));
    if (colOf.phoneCandidate) rawPhoneList.push(cellText(row.getCell(colOf.phoneCandidate).value));
    if (colOf.phoneHome) rawPhoneList.push(cellText(row.getCell(colOf.phoneHome).value));
    if (colOf.phoneSecondary) rawPhoneList.push(cellText(row.getCell(colOf.phoneSecondary).value));

    const validPhones: string[] = [];
    for (const raw of rawPhoneList) {
      for (const p of parsePhoneNumbers(raw)) {
        if (!validPhones.includes(p)) validPhones.push(p);
      }
    }

    const phone = validPhones[0] || null;
    const phoneSecondary = validPhones[1] || null;

    const data: ImportRow = {
      fullName,
      position: get("position") || "—",
      department: get("department") || "—",
      phone,
      phoneSecondary,
      telegramId,
    };

    if (!prev) {
      toCreate.push(data);
    } else if (
      // обновляем только при реальном изменении — иначе повторный импорт ничего не пишет
      prev.position !== data.position ||
      prev.department !== data.department ||
      (prev.phone ?? null) !== data.phone ||
      (prev.phoneSecondary ?? null) !== data.phoneSecondary ||
      (prev.telegramId ?? null) !== data.telegramId ||
      prev.fullName !== data.fullName
    ) {
      toUpdate.push({ id: prev.id, data });
    }
  }

  // 3) Массовые записи: createMany + update-транзакции батчами.
  if (!dryRun) {
    try {
      if (toCreate.length) {
        await db.employee.createMany({ data: toCreate.map(withPhoneNormalized) });
      }
      for (const batch of chunk(toUpdate, 400)) {
        await db.$transaction(
          batch.map((u) =>
            db.employee.update({ where: { id: u.id }, data: withPhoneNormalized(u.data) }),
          ),
        );
      }
    } catch {
      return { error: "Не удалось записать данные. Проверьте файл и повторите." };
    }
  }

  // 4) Деактивация отсутствующих — по нормализованным ФИО, одним updateMany на батч.
  let deactivated = 0;
  let deactivateList: string[] | undefined;
  if (wantDeactivate && seenNames.size > 0) {
    const absent = existing.filter((e) => e.isActive && !seenNames.has(norm(e.fullName)));
    deactivateList = absent.map((e) => e.fullName);
    deactivated = absent.length;
    // Предохранитель: сопоставление идёт по ФИО (нестабильный ключ). Если файл
    // «увольняет» подозрительно много людей — это почти наверняка кривой файл
    // (не тот лист, другая раскладка ФИО). Требуем сначала прогнать dry-run.
    const activeCount = existing.filter((e) => e.isActive).length;
    const cap = Math.max(15, Math.ceil(activeCount * 0.25));
    if (!dryRun && absent.length > cap) {
      return {
        error:
          `Импорт остановлен: файл деактивировал бы ${absent.length} сотрудников (порог ${cap}). ` +
          `Сначала запустите предпросмотр (dry-run) и проверьте список — вероятно, в файле не тот лист или другой формат ФИО.`,
        deactivateList,
      };
    }
    if (!dryRun && absent.length) {
      const now = new Date();
      for (const ids of chunk(absent.map((e) => e.id), 1000)) {
        await db.employee.updateMany({
          where: { id: { in: ids } },
          data: { isActive: false, status: "TERMINATED", terminatedAt: now, archivedAt: now },
        });
        await db.user.updateMany({ where: { employeeId: { in: ids } }, data: { isActive: false } });
      }
    }
  }

  const created = toCreate.length;
  const updated = toUpdate.length;

  if (dryRun) {
    return { ok: true, dryRun: true, created, updated, deactivated, deactivateList, rowErrors };
  }

  await audit({
    actorId: s.user.id,
    action: "EMPLOYEES_IMPORTED",
    entityType: "Employee",
    newValue: { created, updated, deactivated, rows: seenNames.size, file: file.name },
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/access");
  return { ok: true, created, updated, deactivated, deactivateList, rowErrors };
}
