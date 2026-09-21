"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { NOTIFICATION_EVENTS, TEMPLATE_PLACEHOLDERS } from "@/lib/notification-format";
import { DEFAULT_TEMPLATES_I18N } from "@/lib/notification-i18n";

export type TemplateFormState = { ok?: boolean; error?: string };

function isKnownEvent(e: string): boolean {
  return (NOTIFICATION_EVENTS as readonly string[]).includes(e);
}

/** Проверяет, что в теле нет плейсхолдеров вне списка допустимых для события. */
function unknownPlaceholders(event: string, body: string): string[] {
  const allowed = new Set(TEMPLATE_PLACEHOLDERS[event] ?? []);
  const used = (body.match(/\{([^}]+)\}/g) ?? []).map((t) => t.slice(1, -1).trim());
  return [...new Set(used.filter((u) => !allowed.has(u)))];
}

export async function updateNotificationTemplate(
  event: string,
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const s = await requireSession();
  assertCan(s.roles, "cards.manage");

  if (!isKnownEvent(event)) return { error: "Неизвестное событие." };

  const label = String(formData.get("label") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!label) return { error: "Укажите название." };
  if (!body) return { error: "Текст шаблона не может быть пустым." };
  if (body.includes("[[") !== body.includes("]]")) {
    return { error: "Непарные скобки [[ … ]]." };
  }

  const bad = unknownPlaceholders(event, body);
  if (bad.length) {
    return { error: `Недопустимые плейсхолдеры: ${bad.map((b) => `{${b}}`).join(", ")}` };
  }

  // Переводы tg/uz: пусто или совпадает с зашитым — не храним (действует зашитый перевод).
  const translations: Record<string, string> = {};
  for (const l of ["tg", "uz"] as const) {
    const text = String(formData.get(`body_${l}`) ?? "").trim();
    if (!text || text === DEFAULT_TEMPLATES_I18N[l][event]) continue;
    if (text.includes("[[") !== text.includes("]]")) return { error: `Непарные скобки [[ … ]] в тексте (${l}).` };
    const badTr = unknownPlaceholders(event, text);
    if (badTr.length) {
      return { error: `Недопустимые плейсхолдеры (${l}): ${badTr.map((b) => `{${b}}`).join(", ")}` };
    }
    translations[l] = text;
  }
  const trValue = Object.keys(translations).length ? translations : Prisma.DbNull;

  await db.notificationTemplate.upsert({
    where: { event },
    create: { event, label, body, translations: trValue, updatedById: s.user.id },
    update: { label, body, translations: trValue, updatedById: s.user.id },
  });
  await audit({
    actorId: s.user.id,
    action: "NOTIFICATION_TEMPLATE_UPDATED",
    entityType: "NotificationTemplate",
    entityId: event,
    newValue: { label, body, translations },
  });
  revalidatePath("/admin/notifications");
  return { ok: true };
}

/** Убрать переопределение — вернуться к зашитому шаблону по умолчанию. */
export async function resetNotificationTemplate(event: string): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "cards.manage");
  if (!isKnownEvent(event)) return;

  await db.notificationTemplate.deleteMany({ where: { event } });
  await audit({
    actorId: s.user.id,
    action: "NOTIFICATION_TEMPLATE_RESET",
    entityType: "NotificationTemplate",
    entityId: event,
  });
  revalidatePath("/admin/notifications");
}
