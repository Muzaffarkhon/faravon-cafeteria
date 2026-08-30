"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { issueIdentificationCode } from "@/lib/otp";

export async function issueCode(employeeId: string): Promise<{ code: string } | { error: string }> {
  const s = await requireSession();
  assertCan(s.roles, "access.manage");
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return { error: "Сотрудник не найден." };
  const code = await issueIdentificationCode(employeeId, s.user.id);
  revalidatePath("/admin/access");
  return { code };
}

export async function unlinkTelegram(employeeId: string) {
  const s = await requireSession();
  assertCan(s.roles, "access.manage");
  await db.employee.update({ where: { id: employeeId }, data: { telegramId: null } });
  await audit({ actorId: s.user.id, action: "TELEGRAM_UNLINKED", entityType: "Employee", entityId: employeeId });
  revalidatePath("/admin/access");
}
