"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { flushTelegram } from "@/lib/notify";
import { resolveAudience } from "@/lib/broadcast-audience";
import { platformUrl } from "@/lib/platform-url";

export type NewsFormState = { success?: true; newsId?: string; error?: string };

function readTranslations(formData: FormData): Prisma.InputJsonValue | undefined {
  const raw = String(formData.get("translations") ?? "");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

/** Создаёт или обновляет черновик новости. `id` в formData — редактирование, иначе — создание. */
export async function saveNews(_prev: NewsFormState, formData: FormData): Promise<NewsFormState> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const department = String(formData.get("department") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim();

  if (!title) return { error: "Введите заголовок новости." };
  if (!body) return { error: "Введите текст новости." };

  const audience = department || position ? { department: department || undefined, position: position || undefined } : null;
  const translations = readTranslations(formData);

  const data = { title, body, imageUrl, audience: audience ?? undefined, translations };

  const news = id
    ? await db.news.update({ where: { id }, data })
    : await db.news.create({ data });

  await audit({
    actorId: session.user.id,
    action: id ? "NEWS_UPDATED" : "NEWS_CREATED",
    entityType: "News",
    entityId: news.id,
    newValue: { title, department, position },
  });

  revalidatePath("/admin/news");
  revalidatePath(`/admin/news/${news.id}`);
  return { success: true, newsId: news.id };
}

/** Публикует черновик — с этого момента новость видна в попапе и в ленте. */
export async function publishNews(id: string): Promise<{ error?: string } | undefined> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");

  const news = await db.news.findUnique({ where: { id }, select: { status: true } });
  if (!news) return { error: "Новость не найдена." };
  if (news.status === "PUBLISHED") return { error: "Новость уже опубликована." };

  await db.news.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await audit({ actorId: session.user.id, action: "NEWS_PUBLISHED", entityType: "News", entityId: id });

  revalidatePath("/admin/news");
  revalidatePath(`/admin/news/${id}`);
  revalidatePath("/news");
}

/** Отправляет новость как сообщение в Telegram-бот (событие BROADCAST, текст = заголовок + текст + ссылка). */
export async function sendNewsToBot(id: string): Promise<{ error?: string; sent?: number } | undefined> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");

  const news = await db.news.findUnique({ where: { id } });
  if (!news) return { error: "Новость не найдена." };
  if (news.status !== "PUBLISHED") return { error: "Сначала опубликуйте новость." };

  const filters = {
    segment: "ALL" as const,
    department: (news.audience as { department?: string } | null)?.department ?? "",
    position: (news.audience as { position?: string } | null)?.position ?? "",
    q: "",
  };
  const audience = await resolveAudience(filters);
  if (audience.error) return { error: audience.error };
  if (audience.users.length === 0) return { error: "Нет получателей по аудитории этой новости." };

  const siteUrl = platformUrl() || "";
  const link = siteUrl ? `\n\n${siteUrl}/news/${news.id}` : "";
  const plainBody = news.body.replace(/[*_~#]/g, "");
  const text = `${news.title}\n\n${plainBody}${link}`;

  await db.notification.createMany({
    data: audience.users.map((u) => ({
      userId: u.id,
      event: "BROADCAST",
      channel: "TELEGRAM",
      payload: { text },
    })),
  });
  flushTelegram();

  await db.news.update({ where: { id }, data: { telegramSentAt: new Date() } });
  await audit({
    actorId: session.user.id,
    action: "NEWS_SENT_TO_BOT",
    entityType: "News",
    entityId: id,
    newValue: { recipients: audience.users.length },
  });

  revalidatePath(`/admin/news/${id}`);
  return { sent: audience.users.length };
}
