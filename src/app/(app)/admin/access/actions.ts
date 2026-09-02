"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ALL_PERMISSIONS, assertCan } from "@/lib/rbac";
import { ensureRbac } from "@/lib/rbac-load";
import { audit } from "@/lib/audit";
import { issueIdentificationCode } from "@/lib/otp";
import { runAction, type ActionResult } from "@/lib/action-result";
import { ALL_ROLES } from "../users/roles";

export async function issueCode(employeeId: string): Promise<{ code: string } | { error: string }> {
  const s = await requireSession();
  assertCan(s.roles, "access.manage");
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return { error: "Сотрудник не найден." };
  const code = await issueIdentificationCode(employeeId, s.user.id);
  revalidatePath("/admin/access");
  return { code };
}

/** Сохранить матрицу ролей и прав (чекбоксы `p:<role>:<permission>`). */
export async function saveRbacMatrix(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "access.manage");

    // Собираем полную сетку role × permission из формы.
    const rows: { role: Role; permission: string; allowed: boolean }[] = [];
    const nextAllow: Record<string, Set<Role>> = {};
    for (const permission of ALL_PERMISSIONS) {
      nextAllow[permission] = new Set<Role>();
      for (const role of ALL_ROLES) {
        const allowed = formData.get(`p:${role}:${permission}`) != null;
        if (allowed) nextAllow[permission].add(role);
        rows.push({ role, permission, allowed });
      }
    }

    // Защита от самоблокировки: после сохранения текущий пользователь должен
    // сохранить доступ и к матрице, и к назначению ролей.
    for (const guard of ["access.manage", "users.manage"] as const) {
      if (!s.roles.some((r) => nextAllow[guard].has(r))) {
        throw new Error(
          `Нельзя снять с ваших ролей право «${guard}» — вы потеряете доступ к управлению.`,
        );
      }
    }

    await db.$transaction(
      rows.map((w) =>
        db.rolePermission.upsert({
          where: { role_permission: { role: w.role, permission: w.permission } },
          update: { allowed: w.allowed },
          create: w,
        }),
      ),
    );
    await audit({
      actorId: s.user.id,
      action: "RBAC_MATRIX_CHANGED",
      entityType: "RolePermission",
      newValue: Object.fromEntries(
        ALL_PERMISSIONS.map((p) => [p, [...nextAllow[p]].sort()]),
      ),
    });
    await ensureRbac(true);
    revalidatePath("/", "layout"); // матрица влияет на навигацию и доступ везде
  });
}

export async function unlinkTelegram(employeeId: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "access.manage");
    await db.employee.update({ where: { id: employeeId }, data: { telegramId: null } });
    await audit({
      actorId: s.user.id,
      action: "TELEGRAM_UNLINKED",
      entityType: "Employee",
      entityId: employeeId,
    });
    revalidatePath("/admin/access");
  });
}
