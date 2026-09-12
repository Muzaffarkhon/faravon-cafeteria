"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";

function revalidateAll() {
  revalidatePath("/admin/support/faq");
}

function parse(question: string, answer: string): { question: string; answer: string } {
  const q = question.trim();
  const a = answer.trim();
  if (!q) throw new Error("Введите вопрос — это подпись кнопки в Telegram.");
  if (q.length > 64) throw new Error("Вопрос слишком длинный — Telegram ограничивает подпись кнопки 64 символами.");
  if (!a) throw new Error("Введите ответ.");
  return { question: q, answer: a };
}

export async function createFaq(question: string, answer: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    const data = parse(question, answer);
    const faq = await db.supportFaq.create({ data });
    await audit({
      actorId: s.user.id,
      action: "SUPPORT_FAQ_CREATED",
      entityType: "SupportFaq",
      entityId: faq.id,
      newValue: data,
    });
    revalidateAll();
  });
}

export async function updateFaq(id: string, question: string, answer: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    const data = parse(question, answer);
    const existing = await db.supportFaq.findUnique({ where: { id } });
    if (!existing) throw new Error("Вопрос не найден.");

    await db.supportFaq.update({ where: { id }, data });
    await audit({
      actorId: s.user.id,
      action: "SUPPORT_FAQ_UPDATED",
      entityType: "SupportFaq",
      entityId: id,
      oldValue: { question: existing.question, answer: existing.answer },
      newValue: data,
    });
    revalidateAll();
  });
}

export async function deleteFaq(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    const existing = await db.supportFaq.findUnique({ where: { id } });
    if (!existing) throw new Error("Вопрос не найден.");

    await db.supportFaq.delete({ where: { id } });
    await audit({
      actorId: s.user.id,
      action: "SUPPORT_FAQ_DELETED",
      entityType: "SupportFaq",
      entityId: id,
      oldValue: { question: existing.question },
    });
    revalidateAll();
  });
}
