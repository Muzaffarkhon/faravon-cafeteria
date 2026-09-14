"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { updateSatisfactionSettings } from "@/lib/satisfaction";

export type SettingsFormState = { ok?: boolean; error?: string };

export async function saveSatisfactionSettings(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const s = await requireSession();
  assertCan(s.roles, "satisfaction.manage");

  const enabled = formData.get("enabled") === "on";
  const repeatDays = Number.parseInt(String(formData.get("repeatDays") ?? ""), 10);

  try {
    await updateSatisfactionSettings(s.user.id, enabled, repeatDays);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка сохранения." };
  }

  revalidatePath("/admin/satisfaction");
  return { ok: true };
}
