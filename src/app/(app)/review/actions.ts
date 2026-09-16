"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { assertTransition } from "@/lib/application-workflow";
import { audit } from "@/lib/audit";
import { notifyEmployee, flushTelegram } from "@/lib/notify";
import { formCouponForItem, issueCouponIfReady, issueGroupBacklog } from "@/lib/coupon-flow";
import { notifyTaxiContractorOnApprove } from "@/lib/taxi";
import { runAction, type ActionResult } from "@/lib/action-result";

type ApprovedItem = {
  id: string;
  cardId: string;
  contactPhone: string | null;
  application: {
    periodId: string;
    employee: { fullName: string; phone: string | null };
    period: { name: string };
  };
  card: { title: string; partnerId: string | null; minParticipants: number; partner: { deliveryMode: string } | null };
};

/** Кому и что сообщить сотруднику по итогам этого клика — решает вызывающий код. */
type ApproveOutcome = "taxi" | "issued" | "pending";

/**
 * После одобрения позиции: для льгот партнёра с deliveryMode = PHONE_PROMO
 * (такси) купон не формируется — подрядчику уходит уведомление с номером
 * телефона (§4). Для остальных — обычный поток: формируем и выдаём купон
 * (групповую — когда набрана группа + добор ранее сформированных).
 *
 * Возвращает исход именно для ЭТОЙ позиции: "issued" — купон выдан прямо
 * сейчас (для негрупповой льготы это почти всегда так), "pending" — выдача
 * ждёт набора группы. Вызывающий код использует это, чтобы не слать
 * «Позиция одобрена» вдогонку уже отправленному «Купон готов» — сотруднику
 * незачем два сообщения о том, что по сути один и тот же результат.
 */
async function issueAfterApprove(item: ApprovedItem, actorId: string): Promise<ApproveOutcome> {
  if (item.card.partner?.deliveryMode === "PHONE_PROMO") {
    await notifyTaxiContractorOnApprove({
      id: item.id,
      contactPhone: item.contactPhone,
      card: { title: item.card.title, partnerId: item.card.partnerId },
      application: { employee: item.application.employee, period: item.application.period },
    });
    return "taxi";
  }
  const coupon = await formCouponForItem(item.id, actorId);
  const issued = await issueCouponIfReady(coupon.id, actorId);
  if (item.card.minParticipants > 1) {
    await issueGroupBacklog(item.cardId, item.application.periodId, actorId);
  }
  return issued ? "issued" : "pending";
}

async function decideContext(itemId: string) {
  const s = await requireSession();
  assertCan(s.roles, "applications.decide");
  const item = await db.applicationItem.findUnique({
    where: { id: itemId },
    include: {
      application: {
            include: {
              employee: { select: { fullName: true, phone: true } },
              period: { select: { name: true } },
            },
          },
      card: { include: { partner: { select: { deliveryMode: true } } } },
    },
  });
  if (!item) throw new Error("Позиция не найдена.");
  // Разделение полномочий: согласующий не решает по своей собственной заявке.
  if (s.user.employeeId && item.application.employeeId === s.user.employeeId) {
    throw new Error("Нельзя решать по собственной заявке — требуется другой согласующий.");
  }
  return { session: s, item };
}

export async function approveItem(itemId: string): Promise<ActionResult> {
  return runAction(() => approveItemImpl(itemId));
}

async function approveItemImpl(itemId: string) {
  const { session, item } = await decideContext(itemId);

  // Одобрение и выпуск купона — два отдельных шага. Одобрение фиксируется
  // сразу; выпуск купона повторяем идемпотентно (formCouponForItem /
  // issueCouponIfReady сами это умеют). Повторный клик «Одобрить» по уже
  // одобренной позиции — это до-выпуск купона, если он сорвался в прошлый раз,
  // и «Позиция одобрена» тогда уже не шлём — сотрудник получил её один раз.
  const isFirstApproval = item.status !== "APPROVED";
  if (isFirstApproval) {
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
  }

  const revalidate = () => {
    revalidatePath("/review");
    revalidatePath("/");
    revalidatePath("/applications");
  };

  // Сбой выпуска купона не отменяет одобрение: позиция остаётся APPROVED,
  // а сообщение подсказывает повторить.
  let outcome: ApproveOutcome = "pending";
  let issueError: Error | null = null;
  try {
    outcome = await issueAfterApprove(item, session.user.id);
  } catch (e) {
    issueError = e instanceof Error ? e : new Error("ошибка");
  }

  // «Купон готов» отправлен внутри issueAfterApprove — вдогонку ему «Позиция
  // одобрена» не нужна, это одно и то же событие с точки зрения сотрудника.
  // Шлём отдельное уведомление только на первом одобрении и только если
  // купон в этот же клик не ушёл (не выдан или выпуск не удался).
  if (isFirstApproval && outcome !== "issued") {
    await notifyEmployee({
      employeeId: item.application.employeeId,
      event:
        outcome === "taxi"
          ? "TAXI_APPROVED_EMPLOYEE"
          : // Партнёр «по номеру телефона» — сотруднику не про купон/QR, а про промокод от партнёра.
            "ITEM_APPROVED",
      payload: {
        card: item.card.title,
        period: item.application.period.name,
        group: item.card.minParticipants > 1 ? "групповая" : "",
      },
      deferFlush: true,
    });
  }

  flushTelegram();
  revalidate();

  if (issueError) {
    throw new Error(
      `Позиция одобрена, но купон не сформирован: ${issueError.message}. Нажмите «Одобрить» ещё раз, чтобы повторить выпуск.`,
    );
  }
}

export async function rejectItem(itemId: string, comment: string): Promise<ActionResult> {
  return runAction(() => rejectItemImpl(itemId, comment));
}

async function rejectItemImpl(itemId: string, comment: string) {
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
    payload: { card: item.card.title, comment: trimmed, period: item.application.period.name },
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
        include: {
          application: {
            include: {
              employee: { select: { fullName: true, phone: true } },
              period: { select: { name: true } },
            },
          },
          card: { include: { partner: { select: { deliveryMode: true } } } },
        },
      });
      if (!item) throw new Error("позиция не найдена");
      if (s.user.employeeId && item.application.employeeId === s.user.employeeId) {
        throw new Error("нельзя решать по собственной заявке");
      }

      const isFirstApproval = item.status !== "APPROVED";
      if (isFirstApproval) {
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
      }
      // Позиция одобрена — засчитываем; сбой выпуска купона не отменяет
      // одобрения, только добавляет предупреждение (повторный bulkApprove
      // по этим id до-выпустит купон идемпотентно).
      ok++;
      let outcome: ApproveOutcome = "pending";
      try {
        outcome = await issueAfterApprove(item, s.user.id);
      } catch (e) {
        errors.push(
          `${id.slice(-6)}: одобрено, но купон не сформирован — ${
            e instanceof Error ? e.message : "ошибка"
          }`,
        );
      }
      // «Купон готов» уже отправлен внутри issueAfterApprove — вдогонку
      // «Позиция одобрена» не нужна, см. approveItemImpl.
      if (isFirstApproval && outcome !== "issued") {
        await notifyEmployee({
          employeeId: item.application.employeeId,
          event: outcome === "taxi" ? "TAXI_APPROVED_EMPLOYEE" : "ITEM_APPROVED",
          payload: {
            card: item.card.title,
            period: item.application.period.name,
            group: item.card.minParticipants > 1 ? "групповая" : "",
          },
          deferFlush: true,
        });
      }
    } catch (e) {
      errors.push(`${id.slice(-6)}: ${e instanceof Error ? e.message : "ошибка"}`);
    }
  }
  if (ok > 0) flushTelegram(); // одна доставка на всю пачку

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
        include: {
          application: {
            include: {
              employee: { select: { fullName: true, phone: true } },
              period: { select: { name: true } },
            },
          },
          card: { include: { partner: { select: { deliveryMode: true } } } },
        },
      });
      if (!item) throw new Error("позиция не найдена");
      if (s.user.employeeId && item.application.employeeId === s.user.employeeId) {
        throw new Error("нельзя решать по собственной заявке");
      }
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
        payload: { card: item.card.title, comment: trimmed, period: item.application.period.name },
        deferFlush: true,
      });
      ok++;
    } catch (e) {
      errors.push(`${id.slice(-6)}: ${e instanceof Error ? e.message : "ошибка"}`);
    }
  }
  if (ok > 0) flushTelegram();

  revalidatePath("/review");
  revalidatePath("/");
  revalidatePath("/applications");
  return { ok, failed: errors.length, errors };
}
