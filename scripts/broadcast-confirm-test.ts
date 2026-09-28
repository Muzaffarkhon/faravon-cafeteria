/**
 * Проверка рассылки с подтверждением «Да / Нет» и сегмента «по льготе».
 * Только песочница/локальная БД. Без токена бота — никому ничего не уходит:
 *   set -a; . ../faravon-cafeteria-sandbox/.env; set +a; unset TELEGRAM_BOT_TOKEN
 *   npx tsx --conditions=react-server scripts/broadcast-confirm-test.ts
 * Всё созданное (временные сотрудники, учётки, заявки, рассылка, чаты) удаляется в конце.
 */
import { PrismaClient } from "@prisma/client";
import { answerBroadcastConfirm } from "../src/lib/broadcast-confirm";
import { confirmKeyboard, parseConfirmCallback } from "../src/lib/broadcast-confirm-keys";
import { resolveAudience, parseFilters } from "../src/lib/broadcast-audience";

if (!/schema=test|localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Отказ: это не песочница (schema=test) и не локальная БД.");
  process.exit(1);
}
if (process.env.TELEGRAM_BOT_TOKEN) {
  console.error("Отказ: уберите TELEGRAM_BOT_TOKEN (unset), чтобы тест не писал админам в Telegram.");
  process.exit(1);
}

const db = new PrismaClient();
let failed = false;
const check = (cond: unknown, msg: string) => {
  console.log(`  ${cond ? "✓" : "✗ ПРОВАЛ:"} ${msg}`);
  if (!cond) failed = true;
};

async function main() {
  const period = await db.period.findFirst({ where: { status: "OPEN" } }) ?? (await db.period.findFirst({ orderBy: { startDate: "desc" } }));
  const card = await db.benefitCard.findFirst({ where: { archivedAt: null } });
  if (!period || !card) throw new Error("Нужны период и льгота.");

  const tag = `ТЕСТ рассылка ${Date.now()}`;
  const mk = (i: number) =>
    db.employee.create({
      data: {
        fullName: `${tag} #${i}`,
        position: "Тест",
        department: "Тест рассылки",
        telegramId: `9900${Date.now() % 1_000_000}${i}`,
        user: { create: { login: `test-bc-${Date.now()}-${i}`, passwordHash: "x", roles: ["EMPLOYEE"], isActive: true } },
      },
      include: { user: true },
    });
  const [issued, selected, other] = [await mk(1), await mk(2), await mk(3)];
  const empIds = [issued.id, selected.id, other.id];

  try {
    for (const [e, status] of [[issued, "COUPON_ISSUED"], [selected, "APPROVED"]] as const) {
      await db.application.create({
        data: { employeeId: e.id, periodId: period.id, items: { create: { cardId: card.id, status } } },
      });
    }

    console.log("1) Сегмент «по льготе»");
    const aud = async (a: string) =>
      (await resolveAudience(parseFilters({ segment: "BY_CARD", cardId: card.id, periodId: period.id, cardAudience: a, department: "Тест рассылки" })))
        .users.map((u) => u.id);
    const issuedOnly = await aud("ISSUED");
    const selectedOnly = await aud("SELECTED");
    const both = await aud("BOTH");
    check(issuedOnly.length === 1 && issuedOnly[0] === issued.user!.id, "«Получили купон» — только сотрудник с выданным купоном");
    check(selectedOnly.length === 1 && selectedOnly[0] === selected.user!.id, "«Выбрали, купон не выдан» — только выбравший");
    check(both.length === 2 && !both.includes(other.user!.id), "«Все» — оба, посторонний не попал");

    console.log("2) Кнопки");
    const campaign = await db.broadcastCampaign.create({
      data: { title: `${tag} кампания`, text: "Вы точно пойдёте?", createdById: issued.user!.id },
    });
    await db.broadcastRecipient.createMany({ data: [issued, selected].map((e) => ({ campaignId: campaign.id, userId: e.user!.id })) });
    const [rIssued, rSelected] = await Promise.all(
      [issued, selected].map((e) => db.broadcastRecipient.findUniqueOrThrow({ where: { campaignId_userId: { campaignId: campaign.id, userId: e.user!.id } } })),
    );
    const kb = confirmKeyboard(rIssued.id, "ru");
    const yesData = kb.inline_keyboard[0][0].callback_data;
    check(Buffer.byteLength(yesData) <= 64, `callback_data в лимите Telegram (${Buffer.byteLength(yesData)} байт)`);
    check(JSON.stringify(parseConfirmCallback(yesData)) === JSON.stringify({ answer: "YES", recipientId: rIssued.id }), "кнопка «Да» разбирается обратно");

    console.log("3) Ответ «Да»");
    const foreign = await answerBroadcastConfirm({ recipientId: rIssued.id, answer: "YES", telegramId: other.telegramId! });
    check(foreign === null, "чужой Telegram не может ответить за сотрудника");
    const yes = await answerBroadcastConfirm({ recipientId: rIssued.id, answer: "YES", telegramId: issued.telegramId! });
    check(yes?.startsWith("Спасибо!"), `бот ответил: «${yes?.slice(0, 40)}…»`);
    const again = await answerBroadcastConfirm({ recipientId: rIssued.id, answer: "NO", telegramId: issued.telegramId! });
    check(again?.includes("уже учтён"), "повторное нажатие не меняет ответ");
    const recYes = await db.broadcastRecipient.findUniqueOrThrow({ where: { id: rIssued.id } });
    check(recYes.answer === "YES" && recYes.answeredAt, "в отчёте: «Да»");
    const threadYes = await db.supportThread.findUnique({ where: { telegramId: issued.telegramId! }, include: { messages: true } });
    check(threadYes?.status === "CLOSED" && threadYes.messages[0]?.readAt, "«Да» тихо записано в чат поддержки (без уведомления админам)");

    console.log("4) Ответ «Нет»");
    const no = await answerBroadcastConfirm({ recipientId: rSelected.id, answer: "NO", telegramId: selected.telegramId! });
    check(no?.includes("причину"), "бот просит написать причину");
    const threadNo = await db.supportThread.findUnique({ where: { telegramId: selected.telegramId! }, include: { messages: true } });
    check(threadNo?.status === "OPEN" && threadNo.messages.some((m) => m.body.includes("Ответ: Нет") && !m.readAt), "«Нет» открыло диалог в «Поддержке» как непрочитанное");
  } finally {
    console.log("\nОткат…");
    const tgIds = [issued, selected, other].map((e) => e.telegramId!);
    const threads = await db.supportThread.findMany({ where: { telegramId: { in: tgIds } }, select: { id: true } });
    await db.supportMessage.deleteMany({ where: { threadId: { in: threads.map((t) => t.id) } } });
    await db.supportThread.deleteMany({ where: { id: { in: threads.map((t) => t.id) } } });
    await db.broadcastCampaign.deleteMany({ where: { title: { startsWith: tag } } });
    await db.application.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.user.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.employee.deleteMany({ where: { id: { in: empIds } } });
    console.log("Откат завершён.");
  }
  console.log(failed ? "\nИТОГ: ЕСТЬ ПРОВАЛЫ" : "\nИТОГ: всё прошло");
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
