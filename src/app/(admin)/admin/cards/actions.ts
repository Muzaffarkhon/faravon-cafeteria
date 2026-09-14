"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { Prisma, type Block, type CardStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { recordCardVersion, restoreCardVersion } from "@/lib/card-version";
import { runAction, type ActionResult } from "@/lib/action-result";

export type CardFormState = { error?: string };

const BLOB_HOST = ".public.blob.vercel-storage.com";

/** Удаляет старый файл из Vercel Blob, если карточка сменила/убрала изображение. */
async function cleanupBlob(oldUrl: string | null, newUrl: string | null) {
  if (!oldUrl || oldUrl === newUrl) return;
  if (!oldUrl.includes(BLOB_HOST)) return; // внешняя ссылка — не трогаем
  try {
    await del(oldUrl);
  } catch {
    // нет BLOB_READ_WRITE_TOKEN или файл уже удалён — не блокируем сохранение
  }
}

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
  const minRaw = Number.parseInt(String(formData.get("minParticipants") ?? "1"), 10);
  const partnerId = block === "FLEX" ? str("partnerId") : null;

  let translations: object | null = null;
  try {
    const parsed = JSON.parse(String(formData.get("translations") ?? "{}"));
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length) translations = parsed;
  } catch {
    /* поле пришло в неожиданном виде — просто не сохраняем переводы */
  }

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
    minParticipants: Number.isFinite(minRaw) && minRaw > 1 ? minRaw : 1,
    partnerId,
    translations: (translations ?? Prisma.JsonNull) as Prisma.InputJsonValue,
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
  await recordCardVersion({ card, editedById: s.user.id, reason: "created" });
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
  const prev = await db.benefitCard.findUnique({ where: { id }, select: { imageUrl: true } });
  const card = await db.benefitCard.update({ where: { id }, data });
  await recordCardVersion({ card, editedById: s.user.id, reason: "updated" });
  await cleanupBlob(prev?.imageUrl ?? null, data.imageUrl);
  await audit({ actorId: s.user.id, action: "CARD_UPDATED", entityType: "BenefitCard", entityId: id, newValue: { title: data.title, status: data.status, isActive: data.isActive } });
  revalidatePath("/admin/cards");
  revalidatePath("/");
  redirect("/admin/cards");
}

export async function restoreCardVersionAction(versionId: string): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "cards.manage");
  const { cardId, restoredFrom } = await restoreCardVersion(versionId, s.user.id);
  await audit({
    actorId: s.user.id,
    action: "CARD_VERSION_RESTORED",
    entityType: "BenefitCard",
    entityId: cardId,
    newValue: { restoredFrom },
  });
  revalidatePath(`/admin/cards/${cardId}`);
  revalidatePath("/admin/cards");
  revalidatePath("/");
}

/** Отправить карточку в архив / вернуть из архива. */
export async function setCardArchived(id: string, archived: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "cards.manage");
    await db.benefitCard.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await audit({
      actorId: s.user.id,
      action: archived ? "CARD_ARCHIVED" : "CARD_RESTORED",
      entityType: "BenefitCard",
      entityId: id,
    });
    revalidatePath("/admin/cards");
    revalidatePath("/");
  });
}

export async function deleteCard(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "cards.manage");
    const used = await db.applicationItem.count({ where: { cardId: id } });
    if (used > 0) {
      throw new Error(
        `Нельзя удалить: по карточке есть ${used} позиций заявок. Снимите с публикации или деактивируйте.`,
      );
    }
    const doomed = await db.benefitCard.findUnique({ where: { id }, select: { imageUrl: true } });
    await db.benefitCard.delete({ where: { id } });
    await cleanupBlob(doomed?.imageUrl ?? null, null);
    await audit({ actorId: s.user.id, action: "CARD_DELETED", entityType: "BenefitCard", entityId: id });
    revalidatePath("/admin/cards");
    revalidatePath("/");
  });
}
