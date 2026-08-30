"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Block, CardStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export type CardFormState = { error?: string };

const BLOCKS: Block[] = ["RECOGNITION", "CARE", "FLEX"];
const STATUSES: CardStatus[] = ["DRAFT", "PUBLISHED"];

function parse(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Укажите название карточки.");

  const blockRaw = String(formData.get("block") ?? "");
  if (!BLOCKS.includes(blockRaw as Block)) throw new Error("Некорректный блок.");
  const block = blockRaw as Block;

  const statusRaw = String(formData.get("status") ?? "PUBLISHED");
  const status = (STATUSES.includes(statusRaw as CardStatus) ? statusRaw : "PUBLISHED") as CardStatus;

  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || null;
  };
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "0"), 10);
  const partnerId = block === "FLEX" ? str("partnerId") : null;

  return {
    block,
    title,
    status,
    description: str("description"),
    condition: str("condition"),
    imageUrl: str("imageUrl"),
    category: str("category"),
    isActive: formData.get("isActive") === "on",
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    partnerId,
  };
}

export async function createCard(
  _prev: CardFormState,
  formData: FormData,
): Promise<CardFormState> {
  const s = await requireSession();
  assertCan(s.roles, "cards.manage");
  let data;
  try {
    data = parse(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
  const card = await db.benefitCard.create({ data });
  await audit({ actorId: s.user.id, action: "CARD_CREATED", entityType: "BenefitCard", entityId: card.id, newValue: { title: card.title, block: card.block } });
  revalidatePath("/admin/cards");
  revalidatePath("/");
  redirect("/admin/cards");
}

export async function updateCard(
  id: string,
  _prev: CardFormState,
  formData: FormData,
): Promise<CardFormState> {
  const s = await requireSession();
  assertCan(s.roles, "cards.manage");
  let data;
  try {
    data = parse(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
  await db.benefitCard.update({ where: { id }, data });
  await audit({ actorId: s.user.id, action: "CARD_UPDATED", entityType: "BenefitCard", entityId: id, newValue: { title: data.title, status: data.status, isActive: data.isActive } });
  revalidatePath("/admin/cards");
  revalidatePath("/");
  redirect("/admin/cards");
}

export async function deleteCard(id: string) {
  const s = await requireSession();
  assertCan(s.roles, "cards.manage");
  const used = await db.applicationItem.count({ where: { cardId: id } });
  if (used > 0) {
    throw new Error(
      `Нельзя удалить: по карточке есть ${used} позиций заявок. Снимите с публикации или деактивируйте.`,
    );
  }
  await db.benefitCard.delete({ where: { id } });
  await audit({ actorId: s.user.id, action: "CARD_DELETED", entityType: "BenefitCard", entityId: id });
  revalidatePath("/admin/cards");
  revalidatePath("/");
}
