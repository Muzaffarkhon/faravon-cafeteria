"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { runAction, type ActionResult } from "@/lib/action-result";
import { SurveyError, deleteSurvey, saveSurvey, type SurveyQuestionInput } from "@/lib/surveys";

export type SurveyPayload = {
  title: string;
  description: string;
  coins: number;
  giftSpin: boolean;
  isActive: boolean;
  /** datetime-local по Душанбе или "" — без ограничения. */
  startsAt: string;
  endsAt: string;
  questions: SurveyQuestionInput[];
};

// Время в форме — по Душанбе (UTC+5, без перехода на летнее время).
const parseLocal = (v: string) => {
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(`${v}:00+05:00`) : null;
  if (!d || Number.isNaN(d.getTime())) throw new SurveyError("Неверная дата показа.");
  return d;
};

/** Создать (id = null) или сохранить опрос; после создания — переход на его страницу. */
export async function saveSurveyAction(id: string | null, p: SurveyPayload): Promise<ActionResult> {
  let createdId: string | null = null;
  const r = await runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "satisfaction.manage");
    const savedId = await saveSurvey(s.user.id, id, {
      title: String(p.title ?? ""),
      description: String(p.description ?? ""),
      coins: Number(p.coins),
      giftSpin: !!p.giftSpin,
      isActive: !!p.isActive,
      startsAt: parseLocal(String(p.startsAt ?? "")),
      endsAt: parseLocal(String(p.endsAt ?? "")),
      questions: Array.isArray(p.questions) ? p.questions : [],
    });
    if (!id) createdId = savedId;
    revalidatePath("/admin/surveys", "layout");
    revalidatePath("/", "layout"); // окно опроса у сотрудников
    return { notice: "Сохранено." };
  });
  if (createdId) redirect(`/admin/surveys/${createdId}`);
  return r;
}

export async function deleteSurveyAction(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "satisfaction.manage");
    await deleteSurvey(s.user.id, id);
    revalidatePath("/admin/surveys", "layout");
  });
  if (!r.error) redirect("/admin/surveys");
  return r;
}
