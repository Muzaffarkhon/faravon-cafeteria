"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, destroySession, readToken } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
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
  assertCan(s.roles, "application.select");
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
    // Условное удаление: только пока позиция всё ещё DRAFT — иначе гонка с
    // submitSelection (DRAFT→PENDING) удалила бы уже отправленную заявку.
    const del = await db.applicationItem.deleteMany({
      where: { id: existing.id, status: "DRAFT" },
    });
    if (del.count === 0) throw new Error("Позиция уже отправлена на согласование.");
    await audit({ actorId: session.user.id, action: "SELECTION_REMOVED", entityType: "ApplicationItem", entityId: existing.id });
  } else if (existing) {
    // Одна льгота — один раз за период (ТЗ v2 §5.6): повторно выбрать нельзя.
    if (existing.status === "REJECTED")
      throw new Error("Эта льгота была отклонена в текущем периоде. Выберите другую.");
    if (existing.status === "CANCELLED")
      throw new Error("Вы уже отменяли эту льготу в текущем периоде. Выберите другую.");
    throw new Error("Эта льгота уже выбрана и находится в обработке.");
  } else {
    // Счёт + создание в одной сериализуемой транзакции — иначе две вкладки
    // одного сотрудника могли обе пройти проверку `used < maxSelections` и
    // добавить больше лимита.
    const item = await db.$transaction(
      async (tx) => {
        const current = await tx.applicationItem.findMany({
          where: { applicationId: app.id },
          select: { status: true },
        });
        if (countAgainstLimit(current) >= period.maxSelections) {
          throw new Error(`Можно выбрать не более ${period.maxSelections} льгот.`);
        }
        return tx.applicationItem.create({
          data: { applicationId: app.id, cardId, status: "DRAFT" },
        });
      },
      { isolationLevel: "Serializable" },
    );
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
