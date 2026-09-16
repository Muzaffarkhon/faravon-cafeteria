"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { PRESET_CONFIG_KEYS, type PresetConfig } from "@/lib/report-builder";

export async function listReportPresets(): Promise<{ id: string; name: string; config: PresetConfig }[]> {
  const rows = await db.reportPreset.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ id: r.id, name: r.name, config: r.config as PresetConfig }));
}

/** Сохранить текущую настройку конструктора как именованный срез (формы конструктора отправляют все свои поля как есть). */
export async function saveReportPreset(formData: FormData): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "reports.view");

  const name = String(formData.get("presetName") ?? "").trim();
  if (!name) throw new Error("Укажите название среза.");

  const config: PresetConfig = {};
  for (const key of PRESET_CONFIG_KEYS) {
    const v = formData.get(key);
    if (typeof v === "string" && v !== "") config[key] = v;
  }

  await db.reportPreset.create({ data: { name, config, createdById: s.user.id } });
  revalidatePath("/admin/reports/builder");
}

export async function deleteReportPreset(formData: FormData): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "reports.view");

  const id = String(formData.get("presetId") ?? "");
  if (!id) return;

  await db.reportPreset.deleteMany({ where: { id } });
  revalidatePath("/admin/reports/builder");
}
