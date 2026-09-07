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

// Таджикистан: UTC+5, без переходов на летнее время.
const TZ = "+05:00";

function parse(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Укажите название периода.");

  // Дату из <input type="date"> (YYYY-MM-DD) трактуем в поясе Душанбе:
  // «start» — начало этого дня по местному, «end» — конец дня по местному.
  // Раньше `new Date("2026-09-30")` = полночь UTC = 05:00 в Душанбе, поэтому
  // окно закрывалось на день раньше.
  const date = (k: string, label: string, boundary: "start" | "end") => {
    const v = String(formData.get(k) ?? "").trim();
    if (!v) throw new Error(`Укажите дату: ${label}.`);
    let iso = v;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      iso = boundary === "start" ? `${v}T00:00:00.000${TZ}` : `${v}T23:59:59.999${TZ}`;
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) {
      iso = `${v}${TZ}`; // datetime-local без пояса — тоже местное время
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error(`Некорректная дата: ${label}.`);
    return d;
  };

  const startDate = date("startDate", "начало периода", "start");
  const endDate = date("endDate", "конец периода", "end");
  const windowStart = date("windowStart", "начало окна выбора", "start");
  const windowEnd = date("windowEnd", "конец окна выбора", "end");

  if (startDate > endDate) throw new Error("Начало периода позже его конца.");
  if (windowStart > windowEnd) throw new Error("Начало окна выбора позже его конца.");
  // §2: окно выбора открывается ДО начала периода (обычно в предыдущем месяце).
  // Требуем лишь, чтобы окно не выходило за конец периода и не открывалось
  // абсурдно рано (более чем за 60 дней до старта).
  if (windowEnd > endDate) {
    throw new Error("Окно выбора не должно заканчиваться позже конца периода.");
  }
  const DAY = 24 * 60 * 60 * 1000;
  if (startDate.getTime() - windowStart.getTime() > 60 * DAY) {
    throw new Error("Окно выбора открывается более чем за 60 дней до начала периода.");
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
