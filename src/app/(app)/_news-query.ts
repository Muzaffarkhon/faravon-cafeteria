import "server-only";
import { db } from "@/lib/db";

export type PendingNews = { id: string; title: string; body: string; imageUrl: string | null };

type Audience = { department?: string; position?: string } | null;

function matches(audience: Audience, employee: { department: string; position: string }): boolean {
  if (!audience) return true;
  if (audience.department && audience.department !== employee.department) return false;
  if (audience.position && audience.position !== employee.position) return false;
  return true;
}

/** Самая старая опубликованная новость, которую этот сотрудник ещё не отметил «Понятно». */
export async function getPendingNewsFor(
  userId: string,
  employee: { department: string; position: string },
): Promise<PendingNews | null> {
  const candidates = await db.news.findMany({
    where: { status: "PUBLISHED", reads: { none: { userId } } },
    orderBy: { publishedAt: "asc" },
    select: { id: true, title: true, body: true, imageUrl: true, audience: true },
  });
  const hit = candidates.find((n) => matches(n.audience as Audience, employee));
  if (!hit) return null;
  return { id: hit.id, title: hit.title, body: hit.body, imageUrl: hit.imageUrl };
}
