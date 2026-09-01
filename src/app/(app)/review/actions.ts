"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { assertTransition } from "@/lib/application-workflow";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";

async function decideContext(itemId: string) {
  const s = await requireSession();
  assertCan(s.roles, "applications.decide");
  const item = await db.applicationItem.findUnique({
    where: { id: itemId },
    include: { application: true, card: true },
  });
  if (!item) throw new Error("Позиция не найдена.");
  return { session: s, item };
}

export async function approveItem(itemId: string) {
  const { session, item } = await decideContext(itemId);
  assertTransition(item.status, "APPROVED", "C_AND_B");

  await db.applicationItem.update({
    where: { id: itemId },
    data: {
      status: "APPROVED",
      decidedById: session.user.id,
      decidedAt: new Date(),
      decisionComment: null,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "ITEM_APPROVED",
    entityType: "ApplicationItem",
    entityId: itemId,
    oldValue: { status: item.status },
    newValue: { status: "APPROVED" },
  });
  await notifyEmployee({
    employeeId: item.application.employeeId,
    event: "ITEM_APPROVED",
    payload: { card: item.card.title },
  });

  revalidatePath("/review");
  revalidatePath("/");
  revalidatePath("/applications");
}

export async function rejectItem(itemId: string, comment: string) {
  const { session, item } = await decideContext(itemId);
  const trimmed = comment.trim();
  if (trimmed.length < 3) throw new Error("Укажите причину отклонения (не короче 3 символов).");
  assertTransition(item.status, "REJECTED", "C_AND_B");

  await db.applicationItem.update({
    where: { id: itemId },
    data: {
      status: "REJECTED",
      decidedById: session.user.id,
      decidedAt: new Date(),
      decisionComment: trimmed,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "ITEM_REJECTED",
    entityType: "ApplicationItem",
    entityId: itemId,
    oldValue: { status: item.status },
    newValue: { status: "REJECTED", comment: trimmed },
  });
  await notifyEmployee({
    employeeId: item.application.employeeId,
    event: "ITEM_REJECTED",
    payload: { card: item.card.title, comment: trimmed },
  });

  revalidatePath("/review");
  revalidatePath("/");
  revalidatePath("/applications");
}

/* ---------------------------------------------------------- массовые действия --- */

export type BulkResult = { ok: number; failed: number; errors: string[] };

export async function bulkApprove(ids: string[]): Promise<BulkResult> {
  const s = await requireSession();
  assertCan(s.roles, "applications.decide");

  let ok = 0;
  const errors: string[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const item = await db.applicationItem.findUnique({
        where: { id },
        include: { application: true, card: true },
      });
      if (!item) throw new Error("позиция не найдена");
      assertTransition(item.status, "APPROVED", "C_AND_B");
      await db.applicationItem.update({
        where: { id },
        data: {
          status: "APPROVED",
          decidedById: s.user.id,
          decidedAt: new Date(),
          decisionComment: null,
        },
      });
      await audit({
        actorId: s.user.id,
        action: "ITEM_APPROVED",
        entityType: "ApplicationItem",
        entityId: id,
        oldValue: { status: item.status },
        newValue: { status: "APPROVED", bulk: true },
      });
      await notifyEmployee({
        employeeId: item.application.employeeId,
        event: "ITEM_APPROVED",
        payload: { card: item.card.title },
      });
      ok++;
    } catch (e) {
      errors.push(`${id.slice(-6)}: ${e instanceof Error ? e.message : "ошибка"}`);
    }
  }

  revalidatePath("/review");
  revalidatePath("/");
  revalidatePath("/applications");
  return { ok, failed: errors.length, errors };
}

export async function bulkReject(ids: string[], comment: string): Promise<BulkResult> {
  const s = await requireSession();
  assertCan(s.roles, "applications.decide");

  const trimmed = comment.trim();
  if (trimmed.length < 3) {
    return { ok: 0, failed: ids.length, errors: ["Укажите причину отклонения (не короче 3 символов)."] };
  }

  let ok = 0;
  const errors: string[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const item = await db.applicationItem.findUnique({
        where: { id },
        include: { application: true, card: true },
      });
      if (!item) throw new Error("позиция не найдена");
      assertTransition(item.status, "REJECTED", "C_AND_B");
      await db.applicationItem.update({
        where: { id },
        data: {
          status: "REJECTED",
          decidedById: s.user.id,
          decidedAt: new Date(),
          decisionComment: trimmed,
        },
      });
      await audit({
        actorId: s.user.id,
        action: "ITEM_REJECTED",
        entityType: "ApplicationItem",
        entityId: id,
        oldValue: { status: item.status },
        newValue: { status: "REJECTED", comment: trimmed, bulk: true },
      });
      await notifyEmployee({
        employeeId: item.application.employeeId,
        event: "ITEM_REJECTED",
        payload: { card: item.card.title, comment: trimmed },
      });
      ok++;
    } catch (e) {
      errors.push(`${id.slice(-6)}: ${e instanceof Error ? e.message : "ошибка"}`);
    }
  }

  revalidatePath("/review");
  revalidatePath("/");
  revalidatePath("/applications");
  return { ok, failed: errors.length, errors };
}
