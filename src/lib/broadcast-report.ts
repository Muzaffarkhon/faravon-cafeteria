import "server-only";
import { db } from "@/lib/db";

/** Получатели рассылки с подтверждением и их ответы — для страницы отчёта и выгрузки. */
export async function loadCampaignReport(id: string) {
  const campaign = await db.broadcastCampaign.findUnique({
    where: { id },
    include: {
      recipients: {
        include: {
          user: {
            select: {
              telegramId: true,
              employee: { select: { fullName: true, department: true, position: true, telegramId: true } },
            },
          },
        },
      },
    },
  });
  if (!campaign) return null;

  const tgIds = campaign.recipients.flatMap((r) => {
    const tg = r.user.telegramId ?? r.user.employee?.telegramId;
    return tg ? [tg] : [];
  });
  const threads = await db.supportThread.findMany({ where: { telegramId: { in: tgIds } }, select: { id: true, telegramId: true } });
  const threadByTg = new Map(threads.map((t) => [t.telegramId, t.id]));

  const order = { NO: 0, YES: 1 } as const;
  const rows = campaign.recipients
    .map((r) => ({
      id: r.id,
      fullName: r.user.employee?.fullName ?? "—",
      department: r.user.employee?.department ?? "",
      position: r.user.employee?.position ?? "",
      answer: r.answer,
      answeredAt: r.answeredAt,
      threadId: threadByTg.get(r.user.telegramId ?? r.user.employee?.telegramId ?? "") ?? null,
    }))
    // «Нет» сверху — с ними нужно работать; дальше «Да», в конце не ответившие.
    .sort((a, b) => (a.answer ? order[a.answer] : 2) - (b.answer ? order[b.answer] : 2) || a.fullName.localeCompare(b.fullName, "ru"));

  return { campaign, rows };
}

export const ANSWER_LABEL = { YES: "Да", NO: "Нет" } as const;
