"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { PRESET_CONFIG_KEYS, type PresetConfig } from "@/lib/report-builder-shared";

export type PresetListItem = {
  id: string;
  name: string;
  config: PresetConfig;
  shared: boolean;
  mine: boolean;
  author: string;
  /** День недели рассылки (1–7), 0 — каждый день, null — не подписан. */
  schedule: number | null;
};

/** Мои срезы + общие срезы коллег. */
export async function listReportPresets(): Promise<PresetListItem[]> {
  const s = await requireSession();
  assertCan(s.roles, "reports.view");
  const rows = await db.reportPreset.findMany({
    where: { OR: [{ createdById: s.user.id }, { shared: true }] },
    orderBy: [{ shared: "asc" }, { createdAt: "desc" }],
    include: {
      createdBy: { select: { login: true, employee: { select: { fullName: true } } } },
      schedules: { where: { userId: s.user.id }, select: { weekday: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    config: r.config as PresetConfig,
    shared: r.shared,
    mine: r.createdById === s.user.id,
    author: r.createdBy.employee?.fullName ?? r.createdBy.login,
    schedule: r.schedules[0] ? (r.schedules[0].weekday ?? 0) : null,
  }));
}

/** Сохранить текущую настройку конструктора как именованный срез (личный или общий). */
export async function saveReportPreset(formData: FormData): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "reports.view");

  const name = String(formData.get("presetName") ?? "").trim().slice(0, 80);
  if (!name) throw new Error("Укажите название среза.");

  const config: PresetConfig = {};
  for (const key of PRESET_CONFIG_KEYS) {
    const v = formData.get(key);
    if (typeof v === "string" && v !== "") config[key] = v.slice(0, 20_000);
  }

  const shared = formData.get("shared") === "on";
  const dup = await db.reportPreset.findFirst({ where: { createdById: s.user.id, name }, select: { id: true } });
  if (dup) {
    await db.reportPreset.update({ where: { id: dup.id }, data: { config, shared } });
  } else {
    await db.reportPreset.create({ data: { name, config, shared, createdById: s.user.id } });
  }
  revalidatePath("/admin/reports/builder");
}

/** Переименовать / сделать общим или личным — только автор. */
export async function updateReportPreset(formData: FormData): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "reports.view");
  const id = String(formData.get("presetId") ?? "");
  if (!id) return;
  const name = String(formData.get("presetName") ?? "").trim().slice(0, 80);
  const data: { name?: string; shared?: boolean } = {};
  if (name) data.name = name;
  if (formData.has("sharedFlag")) data.shared = formData.get("sharedFlag") === "1";
  await db.reportPreset.updateMany({ where: { id, createdById: s.user.id }, data });
  revalidatePath("/admin/reports/builder");
}

/** Удалить — только автор (раньше мог любой с доступом к отчётам). */
export async function deleteReportPreset(formData: FormData): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "reports.view");

  const id = String(formData.get("presetId") ?? "");
  if (!id) return;

  await db.reportPreset.deleteMany({ where: { id, createdById: s.user.id } });
  revalidatePath("/admin/reports/builder");
}

/**
 * Подписка на рассылку среза в Telegram: schedule = "" (отписаться), "0"
 * (каждый день) или "1".."7" (день недели по Душанбе). Подписаться можно на
 * свой срез или на общий.
 */
export async function setReportSchedule(formData: FormData): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "reports.view");
  const presetId = String(formData.get("presetId") ?? "");
  const raw = String(formData.get("schedule") ?? "");
  if (!presetId) return;

  if (raw === "") {
    await db.reportSchedule.deleteMany({ where: { presetId, userId: s.user.id } });
  } else {
    const n = Number.parseInt(raw, 10);
    if (!(n >= 0 && n <= 7)) return;
    const preset = await db.reportPreset.findFirst({
      where: { id: presetId, OR: [{ createdById: s.user.id }, { shared: true }] },
      select: { id: true },
    });
    if (!preset) return;
    const weekday = n === 0 ? null : n;
    await db.reportSchedule.upsert({
      where: { presetId_userId: { presetId, userId: s.user.id } },
      update: { weekday },
      create: { presetId, userId: s.user.id, weekday },
    });
  }
  revalidatePath("/admin/reports/builder");
}
