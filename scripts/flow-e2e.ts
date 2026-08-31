/**
 * Сквозной прогон флоу «выбор → согласование → купон → выдача» на уровне БД.
 * Повторяет логику server actions (actions.ts / review/actions.ts / coupons/actions.ts)
 * и проверяет инварианты после каждого шага. Не заменяет UI-тест, но доказывает
 * корректность переходов статусов, уведомлений и счётчика.
 *
 * Запуск:  npm run flow:reset  &&  npm run flow:e2e
 */
import { PrismaClient } from "@prisma/client";
import { assertTransition } from "../src/lib/application-workflow";
import { formatNotificationText } from "../src/lib/notification-format";

const db = new PrismaClient();

let step = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`  ✗ ПРОВАЛ: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  ok(msg);
}
function head(title: string) {
  console.log(`\n── Шаг ${++step}. ${title} ──`);
}

async function pendingCount() {
  return db.applicationItem.count({ where: { status: "PENDING" } });
}
async function notifCount(event: string) {
  return db.notification.count({ where: { event } });
}

async function main() {
  // --- предусловия ---
  head("Предусловия");
  const period = await db.period.findFirst({ where: { status: "OPEN" }, orderBy: { startDate: "desc" } });
  assert(period, "есть период в статусе OPEN");
  const now = new Date();
  assert(period!.windowStart <= now && now <= period!.windowEnd, "окно выбора открыто");

  const ivanov = await db.employee.findFirst({ where: { user: { login: "ivanov" } }, include: { user: true } });
  assert(ivanov?.user, "сотрудник ivanov существует");

  const approvers = await db.user.findMany({ where: { isActive: true, roles: { has: "APPROVER" } } });
  assert(approvers.length > 0, `согласующих найдено: ${approvers.length}`);

  const flex = await db.benefitCard.findMany({
    where: { block: "FLEX", status: "PUBLISHED", isActive: true },
    take: 3,
    orderBy: { sortOrder: "asc" },
  });
  assert(flex.length === 3, "взяли 3 активные FLEX-льготы для теста");

  const existing = await db.applicationItem.count();
  assert(existing === 0, "флоу пуст (запусти flow:reset, если нет)");

  // --- Шаг: сотрудник выбирает 3 льготы (toggleSelection) ---
  head("ivanov: выбор 3 льгот → DRAFT");
  const app = await db.application.create({ data: { employeeId: ivanov!.id, periodId: period!.id } });
  for (const c of flex) {
    await db.applicationItem.create({ data: { applicationId: app.id, cardId: c.id, status: "DRAFT" } });
  }
  let drafts = await db.applicationItem.findMany({ where: { applicationId: app.id, status: "DRAFT" } });
  assert(drafts.length === 3, "создано 3 позиции в статусе DRAFT");
  assert((await pendingCount()) === 0, "счётчик «Согласование» = 0 (черновики не считаются)");

  // --- Шаг: подтверждение выбора (submitSelection) ---
  head("ivanov: «Подтвердить выбор» → PENDING + уведомление согласующим");
  for (const d of drafts) assertTransition(d.status, "PENDING", "EMPLOYEE");
  await db.applicationItem.updateMany({
    where: { id: { in: drafts.map((d) => d.id) } },
    data: { status: "PENDING", submittedAt: new Date() },
  });
  await db.notification.createMany({
    data: approvers.map((u) => ({
      userId: u.id,
      event: "APPLICATION_SUBMITTED",
      channel: "TELEGRAM",
      payload: { employee: ivanov!.fullName, department: ivanov!.department, period: period!.name, count: drafts.length },
    })),
  });
  assert((await db.applicationItem.count({ where: { applicationId: app.id, status: "PENDING" } })) === 3, "3 позиции → PENDING");
  assert((await pendingCount()) === 3, "счётчик «Согласование» = 3");
  assert((await notifCount("APPLICATION_SUBMITTED")) === approvers.length, `уведомление APPLICATION_SUBMITTED создано для всех согласующих (${approvers.length})`);
  const sample = await db.notification.findFirst({ where: { event: "APPLICATION_SUBMITTED" } });
  console.log(`    текст для бота: "${formatNotificationText("APPLICATION_SUBMITTED", sample!.payload as Record<string, unknown>)}"`);

  // --- Шаг: согласующий одобряет 2, отклоняет 1 (approveItem / rejectItem) ---
  head("approver: одобрить 2, отклонить 1");
  const pend = await db.applicationItem.findMany({ where: { applicationId: app.id, status: "PENDING" }, orderBy: { createdAt: "asc" } });
  const [a1, a2, r1] = pend;
  const approverUser = approvers[0];

  for (const it of [a1, a2]) {
    assertTransition(it.status, "APPROVED", "APPROVER");
    await db.applicationItem.update({ where: { id: it.id }, data: { status: "APPROVED", decidedById: approverUser.id, decidedAt: new Date() } });
    await db.notification.create({ data: { userId: ivanov!.user!.id, event: "ITEM_APPROVED", channel: "TELEGRAM", payload: { card: (await db.benefitCard.findUnique({ where: { id: it.cardId } }))!.title } } });
  }
  assertTransition(r1.status, "REJECTED", "APPROVER");
  await db.applicationItem.update({ where: { id: r1.id }, data: { status: "REJECTED", decidedById: approverUser.id, decidedAt: new Date(), decisionComment: "Лимит бюджета по этой категории исчерпан" } });
  await db.notification.create({ data: { userId: ivanov!.user!.id, event: "ITEM_REJECTED", channel: "TELEGRAM", payload: { card: (await db.benefitCard.findUnique({ where: { id: r1.cardId } }))!.title, comment: "Лимит бюджета по этой категории исчерпан" } } });

  assert((await db.applicationItem.count({ where: { applicationId: app.id, status: "APPROVED" } })) === 2, "2 позиции → APPROVED");
  assert((await db.applicationItem.count({ where: { applicationId: app.id, status: "REJECTED" } })) === 1, "1 позиция → REJECTED");
  assert((await pendingCount()) === 0, "счётчик «Согласование» = 0");
  assert((await notifCount("ITEM_APPROVED")) === 2 && (await notifCount("ITEM_REJECTED")) === 1, "уведомления сотруднику: 2 одобрено, 1 отклонено");

  // --- Шаг: HR BP формирует купоны (createCoupon) ---
  head("hrbp: сформировать купоны для одобренных позиций");
  const approved = await db.applicationItem.findMany({ where: { applicationId: app.id, status: "APPROVED" }, include: { card: true } });
  let seq = (await db.coupon.count()) + 1;
  for (const it of approved) {
    assertTransition(it.status, "COUPON_CREATED", "HR_BP");
    const number = `CPN-${period!.name.replace(/\s/g, "")}-${String(seq++).padStart(4, "0")}`;
    await db.coupon.create({
      data: {
        number,
        status: "CREATED",
        employeeId: ivanov!.id,
        itemId: it.id,
        partnerId: it.card.partnerId,
        periodId: period!.id,
        validUntil: new Date(Date.now() + 60 * 864e5),
      },
    });
    await db.applicationItem.update({ where: { id: it.id }, data: { status: "COUPON_CREATED" } });
    await db.notification.create({ data: { userId: ivanov!.user!.id, event: "COUPON_CREATED", channel: "TELEGRAM", payload: { card: it.card.title, number } } });
  }
  assert((await db.coupon.count({ where: { status: "CREATED" } })) === 2, "создано 2 купона в статусе CREATED");
  assert((await db.applicationItem.count({ where: { applicationId: app.id, status: "COUPON_CREATED" } })) === 2, "2 позиции → COUPON_CREATED");
  assert((await notifCount("COUPON_CREATED")) === 2, "2 уведомления COUPON_CREATED");

  // --- Шаг: HR BP выдаёт купоны (issueCoupon) ---
  head("hrbp: выдать купоны");
  const created = await db.coupon.findMany({ where: { status: "CREATED" }, include: { item: true } });
  for (const c of created) {
    assertTransition(c.item.status, "COUPON_ISSUED", "HR_BP");
    await db.coupon.update({ where: { id: c.id }, data: { status: "ISSUED", issuedAt: new Date() } });
    await db.applicationItem.update({ where: { id: c.itemId }, data: { status: "COUPON_ISSUED" } });
    await db.notification.create({ data: { userId: ivanov!.user!.id, event: "COUPON_ISSUED", channel: "TELEGRAM", payload: { card: (await db.benefitCard.findUnique({ where: { id: c.item.cardId } }))!.title, number: c.number } } });
  }
  assert((await db.coupon.count({ where: { status: "ISSUED" } })) === 2, "2 купона → ISSUED");
  assert((await db.applicationItem.count({ where: { applicationId: app.id, status: "COUPON_ISSUED" } })) === 2, "2 позиции → COUPON_ISSUED");
  assert((await notifCount("COUPON_ISSUED")) === 2, "2 уведомления COUPON_ISSUED");

  // --- Итог ---
  head("Итоговое состояние");
  const byStatus = await db.applicationItem.groupBy({ by: ["status"], _count: true });
  console.log("  позиции:", byStatus.map((s) => `${s.status}=${s._count}`).join("  "));
  const notif = await db.notification.groupBy({ by: ["event"], _count: true });
  console.log("  уведомления:", notif.map((n) => `${n.event}=${n._count}`).join("  "));
  const undelivered = await db.notification.count({ where: { deliveredAt: null } });
  console.log(`  не доставлено ботом: ${undelivered} (у демо-пользователей Telegram не привязан — это ожидаемо)`);
  assert((await pendingCount()) === 0, "финал: счётчик «Согласование» = 0");

  console.log(`\n${process.exitCode ? "❌ ЕСТЬ ПРОВАЛЫ" : "✅ ВЕСЬ ФЛОУ ПРОЙДЕН"}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n" + e.message);
  await db.$disconnect();
  process.exit(1);
});
