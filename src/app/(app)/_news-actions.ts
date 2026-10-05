"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { checkAutoTasksForEmployee } from "@/lib/gamification-tasks";

/** Помечает новость прочитанной для текущего пользователя (кнопка «Понятно»). */
export async function markNewsRead(newsId: string): Promise<void> {
  const session = await requireSession();
  await db.newsRead.upsert({
    where: { newsId_userId: { newsId, userId: session.user.id } },
    create: { newsId, userId: session.user.id },
    update: {},
  });
  if (session.employee) await checkAutoTasksForEmployee(session.employee.id, "NEWS_READ").catch(() => {});
  revalidatePath("/");
}
