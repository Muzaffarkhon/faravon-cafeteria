/**
 * Сквозной прогон геймификации: задача (ручная) → монеты → покупка за монеты.
 * Запуск: npx tsx scripts/gamification-e2e.ts
 */
import { PrismaClient } from "@prisma/client";
import { joinTask, completeEmployeeTaskManual } from "../src/lib/gamification-tasks";
import { getCoinBalance } from "../src/lib/coin-wallet";
import { redeemWithCoins } from "../src/lib/coin-redemption";

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

async function main() {
  head("Предусловия");
  const ivanov = await db.employee.findFirst({ where: { user: { login: "ivanov" } } });
  assert(ivanov, "сотрудник ivanov существует");
  const admin = await db.user.findFirst({ where: { roles: { has: "C_AND_B" } } });
  assert(admin, "есть пользователь C&B");
  const card = await db.benefitCard.findFirst({
    where: { block: "FLEX", status: "PUBLISHED", isActive: true, minParticipants: 1, partner: { deliveryMode: { not: "PHONE_PROMO" } } },
  });
  assert(card, "есть подходящая FLEX-карточка (minParticipants=1, не PHONE_PROMO)");

  head("Создать тестовую задачу (MANUAL)");
  const task = await db.gamificationTask.create({
    data: { title: "E2E тест", description: "тест", coinReward: 100, verification: "MANUAL", createdById: admin!.id },
  });
  ok(`задача создана: ${task.id}`);

  head("ivanov берёт задачу в работу");
  await joinTask({ employeeId: ivanov!.id, taskId: task.id });
  const before = await getCoinBalance(ivanov!.id);
  ok(`баланс до завершения: ${before}`);

  head("C&B подтверждает выполнение → монеты начислены");
  const et = await db.employeeTask.findUniqueOrThrow({ where: { employeeId_taskId: { employeeId: ivanov!.id, taskId: task.id } } });
  await completeEmployeeTaskManual({ employeeTaskId: et.id, actorId: admin!.id });
  const after = await getCoinBalance(ivanov!.id);
  assert(after === before + 100, `баланс увеличился на 100 (было ${before}, стало ${after})`);

  head("Установить цену карточки за монеты и купить INSTANT");
  await db.benefitCard.update({ where: { id: card!.id }, data: { coinPrice: 50, coinRedemptionMode: "INSTANT" } });
  const result = await redeemWithCoins({ employeeId: ivanov!.id, benefitCardId: card!.id, actorId: admin!.id });
  assert(result.status === "FULFILLED", "покупка INSTANT сразу выдала купон");
  const afterBuy = await getCoinBalance(ivanov!.id);
  assert(afterBuy === after - 50, `баланс уменьшился на 50 (было ${after}, стало ${afterBuy})`);

  const redemption = await db.coinRedemption.findUniqueOrThrow({ where: { id: result.redemptionId } });
  assert(!!redemption.couponId, "у заявки на покупку есть привязанный купон");
  const coupon = await db.coupon.findUnique({ where: { id: redemption.couponId! } });
  assert(coupon?.status === "ISSUED", "купон выдан (status = ISSUED)");

  head("Откат тестовых данных");
  await db.coupon.delete({ where: { id: coupon!.id } });
  await db.coinRedemption.delete({ where: { id: redemption.id } });
  await db.applicationItem.deleteMany({ where: { cardId: card!.id, application: { employeeId: ivanov!.id }, coupon: null } });
  await db.coinEntry.deleteMany({ where: { account: { is: { employeeId: ivanov!.id } } } });
  await db.coinAccount.deleteMany({ where: { employeeId: ivanov!.id } });
  await db.employeeTask.delete({ where: { id: et.id } });
  await db.gamificationTask.delete({ where: { id: task.id } });
  await db.benefitCard.update({ where: { id: card!.id }, data: { coinPrice: null, coinRedemptionMode: null } });
  ok("тестовые данные удалены");

  console.log("\n✅ Все проверки пройдены.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
