"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export type AdRequestState = { ok?: boolean; error?: string };

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** Партнёр (учётка подрядчика) подаёт заявку на рекламу своего продукта. */
export async function submitAdvertisingRequest(
  _prev: AdRequestState,
  formData: FormData,
): Promise<AdRequestState> {
  const session = await requireSession();
  assertCan(session.roles, "coupons.confirm");
  if (!session.user.partnerId) {
    return { error: "Заявку на рекламу может подать только учётная запись партнёра." };
  }

  const partner = await db.partner.findUnique({ where: { id: session.user.partnerId } });
  if (!partner) return { error: "Партнёр не найден." };

  const contactName = s(formData.get("contactName"));
  const contactPhone = s(formData.get("contactPhone"));
  const productName = s(formData.get("productName"));
  const productDescription = s(formData.get("productDescription"));
  const budget = s(formData.get("budget")) || null;

  if (!contactName || !contactPhone || !productName || !productDescription) {
    return { error: "Заполните контактное лицо, телефон, продукт и описание." };
  }
  if (!/^[+()\d][\d\s()-]{4,}$/.test(contactPhone)) {
    return { error: "Телефон: цифры, пробелы и знаки + ( ) -, минимум 5 символов." };
  }

  const rec = await db.advertisingRequest.create({
    data: {
      partnerId: partner.id,
      companyName: partner.name,
      contactName,
      contactPhone,
      productName,
      productDescription,
      budget,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "AD_REQUEST_CREATED",
    entityType: "AdvertisingRequest",
    entityId: rec.id,
    newValue: { partnerId: partner.id, productName },
  });

  revalidatePath("/advertising");
  return { ok: true };
}
