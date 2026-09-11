"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PartnerStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";
import { hashPassword } from "@/lib/password";
import { issueOtpForUser } from "@/lib/otp";

export type PartnerFormState = {
  error?: string;
  success?: boolean;
  otp?: string;
  login?: string;
  partnerId?: string;
  partnerName?: string;
};

const STATUSES: PartnerStatus[] = ["ACTIVE", "SOON", "ARCHIVED"];

function normLogin(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim().toLowerCase();
}

function parse(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Укажите название партнёра.");
  const statusRaw = String(formData.get("status") ?? "ACTIVE");
  const status = (STATUSES.includes(statusRaw as PartnerStatus) ? statusRaw : "ACTIVE") as PartnerStatus;
  const date = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v ? new Date(v) : null;
  };
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || null;
  };
  return {
    name,
    status,
    category: str("category"),
    contactPerson: str("contactPerson"),
    contacts: str("contacts"),
    discountType: str("discountType"),
    terms: str("terms"),
    responsible: str("responsible"),
    logoUrl: str("logoUrl"),
    contractStart: date("contractStart"),
    contractEnd: date("contractEnd"),
  };
}

export async function createPartner(
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const s = await requireSession();
  assertCan(s.roles, "partners.manage");
  let data;
  try {
    data = parse(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }

  const createContractor = formData.get("createContractorAccount") === "on";
  const contractorLogin = normLogin(formData.get("contractorLogin"));

  if (createContractor) {
    if (!/^[a-z0-9._-]{3,}$/.test(contractorLogin)) {
      return {
        error: "Логин подрядчика: минимум 3 символа, только латиница, цифры, точка, дефис или подчёркивание.",
      };
    }
    if (await db.user.findUnique({ where: { login: contractorLogin } })) {
      return { error: `Логин «${contractorLogin}» уже занят другим пользователем.` };
    }
  }

  const partner = await db.partner.create({ data });
  await audit({
    actorId: s.user.id,
    action: "PARTNER_CREATED",
    entityType: "Partner",
    entityId: partner.id,
    newValue: { name: partner.name },
  });

  if (createContractor) {
    const user = await db.user.create({
      data: {
        login: contractorLogin,
        passwordHash: await hashPassword(randomUUID()),
        mustChangePassword: true,
        roles: ["CONTRACTOR"],
        partnerId: partner.id,
      },
    });
    await audit({
      actorId: s.user.id,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      newValue: { login: user.login, roles: user.roles, service: true, partnerId: partner.id },
    });
    const otp = await issueOtpForUser(user.id, `admin:${s.user.login}`, s.user.id);
    revalidatePath("/admin/partners");
    revalidatePath("/admin/users");
    return {
      success: true,
      partnerId: partner.id,
      partnerName: partner.name,
      login: user.login,
      otp,
    };
  }

  revalidatePath("/admin/partners");
  redirect("/admin/partners");
}

export type PartnerAccountResult = { error?: string; ok?: boolean; otp?: string; login?: string };

/** Создать учётную запись подрядчика для существующего партнёра. */
export async function createPartnerContractorAccount(
  partnerId: string,
  _prev: PartnerAccountResult,
  formData: FormData,
): Promise<PartnerAccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "partners.manage");

  const partner = await db.partner.findUnique({ where: { id: partnerId } });
  if (!partner) return { error: "Партнёр не найден." };

  const login = normLogin(formData.get("login"));
  if (!/^[a-z0-9._-]{3,}$/.test(login)) {
    return {
      error: "Логин: минимум 3 символа, только латиница, цифры, точка, дефис или подчёркивание.",
    };
  }
  if (await db.user.findUnique({ where: { login } })) {
    return { error: `Логин «${login}» уже занят.` };
  }

  const user = await db.user.create({
    data: {
      login,
      passwordHash: await hashPassword(randomUUID()),
      mustChangePassword: true,
      roles: ["CONTRACTOR"],
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
  revalidatePath(`/admin/partners/${partnerId}`);
  revalidatePath("/admin/partners");
  revalidatePath("/admin/users");
  return { ok: true, login: user.login, otp };
}

/** Выдать новый одноразовый пароль (OTP) для учётной записи подрядчика. */
export async function issuePartnerAccountOtp(
  userId: string,
  partnerId: string,
): Promise<PartnerAccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "partners.manage");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.partnerId !== partnerId) {
    return { error: "Учётная запись подрядчика не найдена." };
  }

  const otp = await issueOtpForUser(user.id, `admin:${s.user.login}`, s.user.id);
  await audit({
    actorId: s.user.id,
    action: "OTP_ISSUED",
    entityType: "User",
    entityId: user.id,
    newValue: { login: user.login, reason: "partner_admin_request" },
  });
  revalidatePath(`/admin/partners/${partnerId}`);
  return { ok: true, otp };
}

/** Включить/отключить вход для учётной записи подрядчика. */
export async function setPartnerAccountActive(
  userId: string,
  partnerId: string,
  isActive: boolean,
): Promise<PartnerAccountResult> {
  const s = await requireSession();
  assertCan(s.roles, "partners.manage");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.partnerId !== partnerId) {
    return { error: "Учётная запись подрядчика не найдена." };
  }

  await db.user.update({ where: { id: userId }, data: { isActive } });
  await audit({
    actorId: s.user.id,
    action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entityType: "User",
    entityId: user.id,
    newValue: { login: user.login, isActive },
  });
  revalidatePath(`/admin/partners/${partnerId}`);
  revalidatePath("/admin/partners");
  return { ok: true };
}

export async function updatePartner(
  id: string,
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const s = await requireSession();
  assertCan(s.roles, "partners.manage");
  let data;
  try {
    data = parse(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
  await db.partner.update({ where: { id }, data });
  await audit({ actorId: s.user.id, action: "PARTNER_UPDATED", entityType: "Partner", entityId: id, newValue: { name: data.name, status: data.status } });
  revalidatePath("/admin/partners");
  revalidatePath("/");
  redirect("/admin/partners");
}

export async function deletePartner(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "partners.manage");
    const [cards, contractors, coupons] = await Promise.all([
      db.benefitCard.count({ where: { partnerId: id } }),
      db.user.count({ where: { partnerId: id } }),
      db.coupon.count({ where: { partnerId: id } }),
    ]);
    if (cards > 0 || contractors > 0 || coupons > 0) {
      const parts = [
        cards > 0 && `${cards} карточк(ами)`,
        contractors > 0 && `${contractors} учётк(ами) подрядчика`,
        coupons > 0 && `${coupons} купон(ами)`,
      ].filter(Boolean);
      throw new Error(`Нельзя удалить: партнёр связан с ${parts.join(", ")}. Переведите в архив.`);
    }
    await db.partner.delete({ where: { id } });
    await audit({ actorId: s.user.id, action: "PARTNER_DELETED", entityType: "Partner", entityId: id });
    revalidatePath("/admin/partners");
  });
}
