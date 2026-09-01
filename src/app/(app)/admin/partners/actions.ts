"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PartnerStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";

export type PartnerFormState = { error?: string };

const STATUSES: PartnerStatus[] = ["ACTIVE", "SOON", "ARCHIVED"];

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
  const partner = await db.partner.create({ data });
  await audit({ actorId: s.user.id, action: "PARTNER_CREATED", entityType: "Partner", entityId: partner.id, newValue: { name: partner.name } });
  revalidatePath("/admin/partners");
  redirect("/admin/partners");
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
    const cards = await db.benefitCard.count({ where: { partnerId: id } });
    if (cards > 0) {
      throw new Error(
        `Нельзя удалить: партнёр связан с ${cards} карточк(ами). Переведите в архив.`,
      );
    }
    await db.partner.delete({ where: { id } });
    await audit({ actorId: s.user.id, action: "PARTNER_DELETED", entityType: "Partner", entityId: id });
    revalidatePath("/admin/partners");
  });
}
