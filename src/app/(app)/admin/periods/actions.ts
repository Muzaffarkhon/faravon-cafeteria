"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PeriodStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";

export type PeriodFormState = { error?: string };

function parse(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Укажите название периода.");

  const date = (k: string, label: string) => {
    const v = String(formData.get(k) ?? "").trim();
    if (!v) throw new Error(`Укажите дату: ${label}.`);
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new Error(`Некорректная дата: ${label}.`);
    return d;
  };

  const startDate = date("startDate", "начало периода");
  const endDate = date("endDate", "конец периода");
  const windowStart = date("windowStart", "начало окна выбора");
  const windowEnd = date("windowEnd", "конец окна выбора");

  if (startDate > endDate) throw new Error("Начало периода позже его конца.");
  if (windowStart > windowEnd) throw new Error("Начало окна выбора позже его конца.");
  if (windowStart < startDate || windowEnd > endDate) {
    throw new Error("Окно выбора должно находиться внутри периода.");
  }

  const maxSelections = Number.parseInt(String(formData.get("maxSelections") ?? "4"), 10);
  if (!Number.isFinite(maxSelections) || maxSelections < 1 || maxSelections > 20) {
    throw new Error("Лимит выбора должен быть от 1 до 20.");
  }

  return { name, startDate, endDate, windowStart, windowEnd, maxSelections };
}

export async function createPeriod(
  _prev: PeriodFormState,
  formData: FormData,
): Promise<PeriodFormState> {
  const s = await requireSession();
  assertCan(s.roles, "periods.manage");
  let data;
  try {
    data = parse(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
  const period = await db.period.create({ data: { ...data, status: "DRAFT" } });
  await audit({ actorId: s.user.id, action: "PERIOD_CREATED", entityType: "Period", entityId: period.id, newValue: { name: period.name } });
  revalidatePath("/admin/periods");
  redirect("/admin/periods");
}

export async function updatePeriod(
  id: string,
  _prev: PeriodFormState,
  formData: FormData,
): Promise<PeriodFormState> {
  const s = await requireSession();
  assertCan(s.roles, "periods.manage");
  let data;
  try {
    data = parse(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
  await db.period.update({ where: { id }, data });
  await audit({ actorId: s.user.id, action: "PERIOD_UPDATED", entityType: "Period", entityId: id, newValue: { name: data.name } });
  revalidatePath("/admin/periods");
  revalidatePath("/");
  redirect("/admin/periods");
}

export async function setPeriodStatus(
  id: string,
  status: PeriodStatus,
): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "periods.manage");

    const period = await db.period.findUnique({ where: { id } });
    if (!period) throw new Error("Период не найден.");

    if (status === "OPEN") {
      if (period.status === "CLOSED") throw new Error("Закрытый период нельзя открыть заново.");
      const otherOpen = await db.period.findFirst({ where: { status: "OPEN", id: { not: id } } });
      if (otherOpen) {
        throw new Error(
          `Уже открыт период «${otherOpen.name}». Закройте его перед открытием нового.`,
        );
      }
    }
    if (status === "CLOSED" && period.status !== "OPEN") {
      throw new Error("Закрыть можно только открытый период.");
    }
    if (status === "DRAFT") {
      throw new Error("Вернуть период в черновик нельзя.");
    }

    await db.period.update({ where: { id }, data: { status } });
    await audit({
      actorId: s.user.id,
      action: status === "OPEN" ? "PERIOD_OPENED" : "PERIOD_CLOSED",
      entityType: "Period",
      entityId: id,
      oldValue: { status: period.status },
      newValue: { status },
    });
    revalidatePath("/admin/periods");
    revalidatePath("/");
    revalidatePath("/applications");
  });
}

export async function deletePeriod(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "periods.manage");
    const apps = await db.application.count({ where: { periodId: id } });
    if (apps > 0) throw new Error(`Нельзя удалить: в периоде ${apps} заявок.`);
    await db.period.delete({ where: { id } });
    await audit({ actorId: s.user.id, action: "PERIOD_DELETED", entityType: "Period", entityId: id });
    revalidatePath("/admin/periods");
  });
}
