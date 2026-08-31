import "server-only";
import { db } from "@/lib/db";
import type { BenefitCard, Prisma } from "@prisma/client";

/** Поля карточки, попадающие в снимок версии. */
export type CardSnapshot = Pick<
  BenefitCard,
  | "block"
  | "title"
  | "description"
  | "condition"
  | "imageUrl"
  | "category"
  | "isActive"
  | "status"
  | "sortOrder"
  | "partnerId"
>;

export function toSnapshot(card: BenefitCard): CardSnapshot {
  return {
    block: card.block,
    title: card.title,
    description: card.description,
    condition: card.condition,
    imageUrl: card.imageUrl,
    category: card.category,
    isActive: card.isActive,
    status: card.status,
    sortOrder: card.sortOrder,
    partnerId: card.partnerId,
  };
}

/**
 * Пишет новую версию карточки. Номер версии = максимум по карточке + 1.
 * `reason`: "created" | "updated" | "restored:vN".
 */
export async function recordCardVersion(params: {
  card: BenefitCard;
  editedById?: string | null;
  reason: string;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const client = params.tx ?? db;
  const last = await client.benefitCardVersion.findFirst({
    where: { cardId: params.card.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  await client.benefitCardVersion.create({
    data: {
      cardId: params.card.id,
      version: (last?.version ?? 0) + 1,
      editedById: params.editedById ?? null,
      reason: params.reason,
      ...toSnapshot(params.card),
    },
  });
}

/**
 * Восстанавливает карточку в состояние выбранной версии: обновляет карточку
 * полями снимка и фиксирует это как новую версию (обратимо).
 */
export async function restoreCardVersion(
  versionId: string,
  actorId?: string | null,
): Promise<{ cardId: string; restoredFrom: number }> {
  const version = await db.benefitCardVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new Error("Версия не найдена.");

  const snapshot: CardSnapshot = {
    block: version.block,
    title: version.title,
    description: version.description,
    condition: version.condition,
    imageUrl: version.imageUrl,
    category: version.category,
    isActive: version.isActive,
    status: version.status,
    sortOrder: version.sortOrder,
    partnerId: version.partnerId,
  };

  const card = await db.benefitCard.update({
    where: { id: version.cardId },
    data: snapshot,
  });
  await recordCardVersion({
    card,
    editedById: actorId,
    reason: `restored:v${version.version}`,
  });

  return { cardId: version.cardId, restoredFrom: version.version };
}
