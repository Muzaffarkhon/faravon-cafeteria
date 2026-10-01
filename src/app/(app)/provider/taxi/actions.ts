"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import {
  broadcastTaxiPromo,
  distributeIndividualTaxiPromos,
  sendSingleTaxiPromo,
  type IndividualPromoEntry,
} from "@/lib/taxi";

export type TaxiPromoState = { sent?: number; error?: string };

/** Подрядчик такси вводит промокод — рассылка одобренным сотрудникам (§11). */
export async function sendTaxiPromo(
  _prev: TaxiPromoState,
  formData: FormData,
): Promise<TaxiPromoState> {
  const session = await requireSession();
  assertCan(session.roles, "promo.broadcast");
  const partnerId = session.user.partnerId;
  if (!partnerId) return { error: "Учётная запись не привязана к партнёру." };

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { deliveryMode: true },
  });
  if (partner?.deliveryMode !== "PHONE_PROMO") {
    return { error: "Рассылка промокодов доступна только партнёрам с режимом «по номеру телефона»." };
  }

  const promo = String(formData.get("promo") ?? "").trim();
  try {
    const sent = await broadcastTaxiPromo(partnerId, session.user.id, promo);
    revalidatePath("/provider/taxi");
    return { sent };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось отправить рассылку." };
  }
}

export type UploadTaxiPromosState = {
  sent?: number;
  matched?: number;
  notFound?: number;
  emptyCode?: number;
  error?: string;
};

/**
 * Загрузка файла Excel с промокодами, сопоставление по номерам телефонов/ID
 * и моментальная рассылка каждому сотруднику в 1 клик.
 */
export async function uploadTaxiPromosExcel(
  _prev: UploadTaxiPromosState,
  formData: FormData,
): Promise<UploadTaxiPromosState> {
  const session = await requireSession();
  assertCan(session.roles, "promo.broadcast");
  const partnerId = session.user.partnerId;
  if (!partnerId) return { error: "Учётная запись не привязана к партнёру." };

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { deliveryMode: true },
  });
  if (partner?.deliveryMode !== "PHONE_PROMO") {
    return { error: "Рассылка промокодов доступна только партнёрам с режимом «по номеру телефона»." };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "Выберите файл Excel (.xlsx) для загрузки." };
  }

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return { error: "В файле нет листов." };

    let phoneCol = -1;
    let promoCol = -1;
    let itemIdCol = -1;

    const headRow = ws.getRow(1);
    headRow.eachCell((cell, colNumber) => {
      const val = String(cell.value ?? "").toLowerCase().trim();
      if (val.includes("телефон") || val.includes("phone") || val === "номер") phoneCol = colNumber;
      if (val.includes("промокод") || val.includes("promo") || val.includes("код")) promoCol = colNumber;
      if (val.includes("id") || val.includes("позици")) itemIdCol = colNumber;
    });

    if (phoneCol === -1) phoneCol = 3;
    if (promoCol === -1) promoCol = 7;
    if (itemIdCol === -1) itemIdCol = 8;

    const entries: IndividualPromoEntry[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rawPhone = row.getCell(phoneCol).text?.trim() || String(row.getCell(phoneCol).value ?? "").trim();
      const rawPromo = row.getCell(promoCol).text?.trim() || String(row.getCell(promoCol).value ?? "").trim();
      const rawItemId = itemIdCol > 0 ? (row.getCell(itemIdCol).text?.trim() || String(row.getCell(itemIdCol).value ?? "").trim()) : undefined;

      if (rawPromo && rawPromo !== "—" && rawPromo !== "-") {
        entries.push({
          phone: rawPhone,
          itemId: rawItemId,
          promo: rawPromo,
        });
      }
    });

    if (entries.length === 0) {
      return { error: "В файле не найдено ни одного заполненного промокода в колонке «Промокод»." };
    }

    const res = await distributeIndividualTaxiPromos(partnerId, session.user.id, entries);
    revalidatePath("/provider/taxi");
    return {
      sent: res.sent,
      matched: res.matched,
      notFound: res.notFound,
      emptyCode: res.emptyCode,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось обработать файл." };
  }
}

export type SinglePromoState = { success?: boolean; error?: string };

/**
 * Точечная отправка или обновление промокода по одной позиции.
 */
export async function sendSingleTaxiPromoAction(
  _prev: SinglePromoState,
  formData: FormData,
): Promise<SinglePromoState> {
  const session = await requireSession();
  assertCan(session.roles, "promo.broadcast");
  const partnerId = session.user.partnerId;
  if (!partnerId) return { error: "Учётная запись не привязана к партнёру." };

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { deliveryMode: true },
  });
  if (partner?.deliveryMode !== "PHONE_PROMO") {
    return { error: "Рассылка промокодов доступна только партнёрам с режимом «по номеру телефона»." };
  }

  const itemId = String(formData.get("itemId") ?? "").trim();
  const promo = String(formData.get("promo") ?? "").trim();

  if (!itemId) return { error: "Не указан ID позиции." };
  if (!promo) return { error: "Введите промокод." };

  try {
    await sendSingleTaxiPromo(partnerId, session.user.id, itemId, promo);
    revalidatePath("/provider/taxi");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось отправить промокод." };
  }
}
