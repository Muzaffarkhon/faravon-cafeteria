"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";

function revalidateAll() {
  revalidatePath("/admin/support/quick-replies");
}

export async function createQuickReply(text: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    const value = text.trim();
    if (!value) throw new Error("Введите текст ответа.");

    const reply = await db.supportQuickReply.create({ data: { text: value } });
    await audit({
      actorId: s.user.id,
      action: "SUPPORT_QUICK_REPLY_CREATED",
      entityType: "SupportQuickReply",
      entityId: reply.id,
      newValue: { text: value },
    });
    revalidateAll();
  });
}

export async function updateQuickReply(id: string, text: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    const value = text.trim();
    if (!value) throw new Error("Введите текст ответа.");

    const existing = await db.supportQuickReply.findUnique({ where: { id } });
    if (!existing) throw new Error("Ответ не найден.");

    await db.supportQuickReply.update({ where: { id }, data: { text: value } });
    await audit({
      actorId: s.user.id,
      action: "SUPPORT_QUICK_REPLY_UPDATED",
      entityType: "SupportQuickReply",
      entityId: id,
      oldValue: { text: existing.text },
      newValue: { text: value },
    });
    revalidateAll();
  });
}

export async function deleteQuickReply(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    const existing = await db.supportQuickReply.findUnique({ where: { id } });
    if (!existing) throw new Error("Ответ не найден.");

    await db.supportQuickReply.delete({ where: { id } });
    await audit({
      actorId: s.user.id,
      action: "SUPPORT_QUICK_REPLY_DELETED",
      entityType: "SupportQuickReply",
      entityId: id,
      oldValue: { text: existing.text },
    });
    revalidateAll();
  });
}
