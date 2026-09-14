"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export type TextFormState = { ok?: boolean; error?: string };

export async function updateTextBlock(
  key: string,
  _prev: TextFormState,
  formData: FormData,
): Promise<TextFormState> {
  const s = await requireSession();
  assertCan(s.roles, "cards.manage");

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title) return { error: "Укажите заголовок." };
  if (!content) return { error: "Текст не может быть пустым." };

  const existing = await db.textBlock.findUnique({ where: { key } });
  if (!existing) return { error: "Блок не найден." };

  let translations: object | null = null;
  try {
    const parsed = JSON.parse(String(formData.get("translations") ?? "{}"));
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length) translations = parsed;
  } catch {
    /* поле пришло в неожиданном виде — просто не сохраняем переводы */
  }

  await db.textBlock.update({
    where: { key },
    data: { title, content, translations: (translations ?? Prisma.JsonNull) as Prisma.InputJsonValue },
  });
  await audit({
    actorId: s.user.id,
    action: "TEXTBLOCK_UPDATED",
    entityType: "TextBlock",
    entityId: key,
    oldValue: { title: existing.title },
    newValue: { title },
  });
  revalidatePath("/");
  revalidatePath("/admin/texts");
  return { ok: true };
}
