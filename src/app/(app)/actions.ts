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
  getOrCreateApplication,
  getApplicationWithItems,
  countAgainstLimit,
  resolveSelectionContext,
  isWithinCancelWindow,
} from "@/lib/selection";
import { submitSatisfactionResponse } from "@/lib/satisfaction";

async function employeeContext() {
  const s = await requireSession();
  assertCan(s.roles, "application.select");
  if (!s.employee) throw new Error("Доступно только сотрудникам.");
  const ctx = await resolveSelectionContext();
  if (!ctx.windowPeriod) throw new Error("Нет активного периода выбора.");
  if (!ctx.windowOpen) throw new Error("Окно выбора закрыто.");
  if (ctx.missingNextPeriod) {
    throw new Error(
      "Период уже начался, а следующий ещё не заведён. Обратитесь в C&B, чтобы создать период на следующий месяц.",
    );
  }
  if (!ctx.targetPeriod) throw new Error("Нет активного периода выбора.");
  return { session: s, employee: s.employee, period: ctx.targetPeriod, rolledOver: ctx.rolledOver };
}

export async function toggleSelection(
  cardId: string,
  contactPhone?: string,
): Promise<ActionResult> {
  return runAction(() => toggleSelectionImpl(cardId, contactPhone));
}

async function toggleSelectionImpl(cardId: string, contactPhone?: string) {
  const { session, employee, period } = await employeeContext();

  const card = await db.benefitCard.findUnique({
    where: { id: cardId },
    include: { partner: true },
  });
  if (!card || card.block !== "FLEX") throw new Error("Некорректная карточка.");
  if (!card.isActive) throw new Error("Эта льгота пока недоступна («скоро»).");

  // §такси: для льгот партнёра с режимом PHONE_PROMO промокод уходит на номер
  // телефона. По умолчанию — номер из профиля; сотрудник может указать другой.
  const isPhonePromo = card.partner?.deliveryMode === "PHONE_PROMO";
  let phone: string | null = null;
  if (isPhonePromo) {
    const raw = (contactPhone ?? "").trim() || employee.phone || "";
    if (!raw) {
      throw new Error(
        "Для этой льготы нужен номер телефона: укажите его при выборе или добавьте в профиль.",
      );
    }
    if (!/^[+()\d][\d\s()-]{4,}$/.test(raw)) {
      throw new Error("Телефон: цифры, пробелы и знаки + ( ) -, минимум 5 символов.");
    }
    phone = raw;
  }

  // Заявка почти всегда уже существует (кроме самого первого выбора за период) —
  // один запрос вместо upsert+findUnique экономит лишний round-trip к БД.
  let withItems = await getApplicationWithItems(employee.id, period.id);
  if (!withItems) {
    await getOrCreateApplication(employee.id, period.id);
    withItems = await getApplicationWithItems(employee.id, period.id);
  }
  const app = withItems!;
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
          data: { applicationId: app.id, cardId, status: "DRAFT", contactPhone: phone },
        });
      },
      { isolationLevel: "Serializable" },
    );
    await audit({ actorId: session.user.id, action: "SELECTION_ADDED", entityType: "ApplicationItem", entityId: item.id });
  }
  revalidatePath("/", "layout");
}

export async function toggleLike(cardId: string): Promise<ActionResult> {
  return runAction(() => toggleLikeImpl(cardId));
}

async function toggleLikeImpl(cardId: string) {
  const s = await requireSession();
  if (!s.employee) throw new Error("Доступно только сотрудникам.");
  const existing = await db.cardLike.findUnique({
    where: { cardId_employeeId: { cardId, employeeId: s.employee.id } },
  });
  if (existing) {
    await db.cardLike.delete({ where: { id: existing.id } });
  } else {
    await db.cardLike.create({ data: { cardId, employeeId: s.employee.id } });
  }
  revalidatePath("/", "layout");
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

  revalidatePath("/", "layout");
  revalidatePath("/applications");
  revalidatePath("/review");
}

export async function cancelItem(itemId: string): Promise<ActionResult> {
  return runAction(() => cancelItemImpl(itemId));
}

async function cancelItemImpl(itemId: string) {
  const s = await requireSession();
  assertCan(s.roles, "application.select");
  if (!s.employee) throw new Error("Доступно только сотрудникам.");

  // Не через employeeContext(): она требует, чтобы окно выбора НОВЫХ льгот
  // было открыто сейчас, а окно отмены уже отправленной позиции — обычно
  // позже (действует до старта периода, часто уже после закрытия окна
  // выбора). Проверяем период именно этой позиции, а не «текущий».
  const item = await db.applicationItem.findUnique({
    where: { id: itemId },
    include: { application: { include: { period: true } } },
  });
  if (!item || item.application.employeeId !== s.employee.id) {
    throw new Error("Позиция не найдена.");
  }
  // §6: уже отправленную позицию можно отменить только в окне отмены —
  // с начала окна выбора периода до его старта. Черновик убирается кнопкой
  // «убрать» в любой момент.
  if (item.status === "PENDING" && !isWithinCancelWindow(item.application.period)) {
    throw new Error(
      "Отменить отправленный выбор можно только в окне выбора этого периода — до его начала.",
    );
  }
  assertTransition(item.status, "CANCELLED", "EMPLOYEE");
  await db.applicationItem.update({ where: { id: itemId }, data: { status: "CANCELLED" } });
  await audit({ actorId: s.user.id, action: "ITEM_CANCELLED", entityType: "ApplicationItem", entityId: itemId });
  revalidatePath("/", "layout");
  revalidatePath("/applications");
}

export async function submitSatisfaction(rating: number, comment: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    if (!s.employee) throw new Error("Доступно только сотрудникам.");
    await submitSatisfactionResponse(s.employee.id, rating, comment);
    revalidatePath("/", "layout");
  });
}

export async function logout() {
  const tok = await readToken();
  if (tok) {
    await audit({ actorId: tok.sub, action: "LOGOUT", entityType: "User", entityId: tok.sub });
  }
  await destroySession();
  redirect("/login");
}
