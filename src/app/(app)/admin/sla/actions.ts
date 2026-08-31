"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { ESCALATABLE_ROLES } from "./roles";

export type SlaRuleFormState = { ok?: boolean; error?: string };

function parse(formData: FormData) {
  const afterHours = Number.parseInt(String(formData.get("afterHours") ?? ""), 10);
  if (!Number.isFinite(afterHours) || afterHours <= 0) {
    throw new Error("Часы должны быть положительным числом.");
  }
  const notifyRoles = ESCALATABLE_ROLES.filter((r) => formData.get(`role:${r}`) === "on");
  if (notifyRoles.length === 0) throw new Error("Выберите хотя бы одну роль-получателя.");
  const active = formData.get("active") === "on";
  return { afterHours, notifyRoles, active };
}

export async function saveSlaRule(
  id: string | null,
  _prev: SlaRuleFormState,
  formData: FormData,
): Promise<SlaRuleFormState> {
  const s = await requireSession();
  assertCan(s.roles, "cards.manage");

  let data;
  try {
    data = parse(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }

  if (id) {
    await db.slaEscalationRule.update({ where: { id }, data });
    await audit({
      actorId: s.user.id,
      action: "SLA_RULE_UPDATED",
      entityType: "SlaEscalationRule",
      entityId: id,
      newValue: data,
    });
  } else {
    const max = await db.slaEscalationRule.aggregate({ _max: { level: true } });
    const level = (max._max.level ?? 0) + 1;
    const created = await db.slaEscalationRule.create({ data: { level, ...data } });
    await audit({
      actorId: s.user.id,
      action: "SLA_RULE_CREATED",
      entityType: "SlaEscalationRule",
      entityId: created.id,
      newValue: { level, ...data },
    });
  }

  revalidatePath("/admin/sla");
  return { ok: true };
}

export async function deleteSlaRule(id: string): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "cards.manage");
  await db.slaEscalationRule.delete({ where: { id } });
  await audit({
    actorId: s.user.id,
    action: "SLA_RULE_DELETED",
    entityType: "SlaEscalationRule",
    entityId: id,
  });
  revalidatePath("/admin/sla");
}
