"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, destroySession, readToken } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";
import { notifyApprovers } from "@/lib/notify";
import { assertTransition } from "@/lib/application-workflow";
import {
  getCurrentPeriod,
  getOrCreateApplication,
  getApplicationWithItems,
  countAgainstLimit,
} from "@/lib/selection";

async function employeeContext() {
  const s = await requireSession();
  if (!s.employee) throw new Error("Доступно только сотрудникам.");
  const period = await getCurrentPeriod();
  if (!period) throw new Error("Нет активного периода выбора.");
  if (!period.windowOpen) throw new Error("Окно выбора закрыто.");
  return { session: s, employee: s.employee, period };
}

export async function toggleSelection(cardId: string): Promise<ActionResult> {
  return runAction(() => toggleSelectionImpl(cardId));
}

async function toggleSelectionImpl(cardId: string) {
  const { session, employee, period } = await employeeContext();

  const card = await db.benefitCard.findUnique({ where: { id: cardId } });
  if (!card || card.block !== "FLEX") throw new Error("Некорректная карточка.");
  if (!card.isActive) throw new Error("Эта льгота пока недоступна («скоро»).");

  const app = await getOrCreateApplication(employee.id, period.id);
  const withItems = await getApplicationWithItems(employee.id, period.id);
  const existing = withItems?.items.find((i) => i.cardId === cardId);

  if (existing && existing.status === "DRAFT") {
    await db.applicationItem.delete({ where: { id: existing.id } });
    await audit({ actorId: session.user.id, action: "SELECTION_REMOVED", entityType: "ApplicationItem", entityId: existing.id });
  } else if (!existing) {
    const used = countAgainstLimit(withItems?.items ?? []);
    if (used >= period.maxSelections) {
      throw new Error(`Можно выбрать не более ${period.maxSelections} льгот.`);
    }
    const item = await db.applicationItem.create({
      data: { applicationId: app.id, cardId, status: "DRAFT" },
    });
    await audit({ actorId: session.user.id, action: "SELECTION_ADDED", entityType: "ApplicationItem", entityId: item.id });
  }
  revalidatePath("/");
}

export async function submitSelection(): Promise<ActionResult> {
  return runAction(submitSelectionImpl);
}

async function submitSelectionImpl() {
  const { session, employee, period } = await employeeContext();
  const withItems = await getApplicationWithItems(employee.id, period.id);
  const drafts = withItems?.items.filter((i) => i.status === "DRAFT") ?? [];
  if (drafts.length === 0) throw new Error("Нет выбранных льгот для подтверждения.");

  for (const d of drafts) {
    assertTransition(d.status, "PENDING", "EMPLOYEE");
  }
  await db.applicationItem.updateMany({
    where: { id: { in: drafts.map((d) => d.id) } },
    data: { status: "PENDING", submittedAt: new Date() },
  });
  await audit({
    actorId: session.user.id,
    action: "APPLICATION_SUBMITTED",
    entityType: "Application",
    entityId: withItems!.id,
    newValue: { items: drafts.length },
  });

  // Уведомление согласующим о новой заявке (§5.7, §5.10)
  await notifyApprovers({
    event: "APPLICATION_SUBMITTED",
    payload: {
      employee: employee.fullName,
      department: employee.department,
      period: period.name,
      count: drafts.length,
    },
  });

  revalidatePath("/");
  revalidatePath("/applications");
  revalidatePath("/review");
}

export async function cancelItem(itemId: string): Promise<ActionResult> {
  return runAction(() => cancelItemImpl(itemId));
}

async function cancelItemImpl(itemId: string) {
  const { session, employee, period } = await employeeContext();
  const item = await db.applicationItem.findUnique({
    where: { id: itemId },
    include: { application: true },
  });
  if (!item || item.application.employeeId !== employee.id || item.application.periodId !== period.id) {
    throw new Error("Позиция не найдена.");
  }
  assertTransition(item.status, "CANCELLED", "EMPLOYEE");
  await db.applicationItem.update({ where: { id: itemId }, data: { status: "CANCELLED" } });
  await audit({ actorId: session.user.id, action: "ITEM_CANCELLED", entityType: "ApplicationItem", entityId: itemId });
  revalidatePath("/");
  revalidatePath("/applications");
}

export async function logout() {
  const tok = await readToken();
  if (tok) {
    await audit({ actorId: tok.sub, action: "LOGOUT", entityType: "User", entityId: tok.sub });
  }
  await destroySession();
  redirect("/login");
}
