/**
 * Проверка переноса недобора для групповых льгот «набор волнами» (§ groupWaves):
 * при закрытии периода уже выданная (полная) волна не должна переноситься и не
 * должна быть тронута, а незавершённый хвост следующей волны обязан перенестись
 * в следующий период новой позицией (PENDING), а не «зависнуть» навсегда.
 *
 * Запуск ТОЛЬКО на песочнице/локальной БД (скрипт сам проверяет DATABASE_URL):
 *   set -a; . ../faravon-cafeteria-sandbox/.env; set +a
 *   npx tsx --conditions=react-server scripts/group-rollover-wave-test.ts
 *
 * В конце откатывает всё, что создал: позиции, заявки, купоны, карточку, периоды,
 * сотрудников, уведомления.
 */
import { PrismaClient } from "@prisma/client";
import { carryUnfilledGroupSelections } from "../src/lib/group-rollover";

const url = process.env.DATABASE_URL ?? "";
if (!/schema=test|localhost|127\.0\.0\.1/.test(url)) {
  console.error("Отказ: это не песочница (schema=test) и не локальная БД.");
  process.exit(1);
}

const db = new PrismaClient();
let failed = false;
const check = (cond: unknown, msg: string) => {
  console.log(`  ${cond ? "✓" : "✗ ПРОВАЛ:"} ${msg}`);
  if (!cond) failed = true;
};

const MIN = 3; // размер волны в тесте
const tag = `ТЕСТ волны ${Date.now()}`;

async function main() {
  const actor = await db.user.findFirst({ where: { roles: { has: "C_AND_B" } } });
  if (!actor) throw new Error("Нет пользователя C&B.");

  const closed = await db.period.create({
    data: {
      name: `${tag} — закрываемый`,
      startDate: new Date("2099-01-01"),
      endDate: new Date("2099-01-31"),
      windowStart: new Date("2099-01-01"),
      windowEnd: new Date("2099-01-10"),
      status: "CLOSED",
    },
  });
  const next = await db.period.create({
    data: {
      name: `${tag} — следующий`,
      startDate: new Date("2099-02-01"),
      endDate: new Date("2099-02-28"),
      windowStart: new Date("2099-02-01"),
      windowEnd: new Date("2099-02-10"),
      status: "DRAFT",
    },
  });

  const card = await db.benefitCard.create({
    data: {
      block: "FLEX",
      title: tag,
      status: "PUBLISHED",
      isActive: true,
      minParticipants: MIN,
      groupWaves: true,
    },
  });

  await db.employee.createMany({
    data: Array.from({ length: 5 }, (_, i) => ({ fullName: `${tag} #${i + 1}`, position: "Тест", department: "Тест переноса" })),
  });
  const employees = await db.employee.findMany({ where: { fullName: { startsWith: tag } }, orderBy: { seq: "asc" } });
  if (employees.length !== 5) throw new Error("Не создались тестовые сотрудники.");

  const apps = [];
  for (const emp of employees) {
    apps.push(await db.application.create({ data: { employeeId: emp.id, periodId: closed.id } }));
  }

  const wave1Items = [];
  for (let i = 0; i < 3; i++) {
    const item = await db.applicationItem.create({
      data: { applicationId: apps[i].id, cardId: card.id, status: "COUPON_ISSUED", submittedAt: new Date() },
    });
    await db.coupon.create({
      data: {
        number: `TESTWAVE-${item.id.slice(-6)}`,
        itemId: item.id,
        employeeId: employees[i].id,
        periodId: closed.id,
        type: "PROMO",
        benefitMode: "ONE_TIME",
        status: "ISSUED",
        deliveryChannel: "PORTAL",
        validUntil: closed.endDate,
        issuedAt: new Date(),
      },
    });
    wave1Items.push(item);
  }

  const item4 = await db.applicationItem.create({
    data: { applicationId: apps[3].id, cardId: card.id, status: "APPROVED", submittedAt: new Date() },
  });
  const item5 = await db.applicationItem.create({
    data: { applicationId: apps[4].id, cardId: card.id, status: "COUPON_CREATED", submittedAt: new Date() },
  });
  const coupon5 = await db.coupon.create({
    data: {
      number: `TESTWAVE-${item5.id.slice(-6)}`,
      itemId: item5.id,
      employeeId: employees[4].id,
      periodId: closed.id,
      type: "PROMO",
      benefitMode: "ONE_TIME",
      status: "CREATED",
      deliveryChannel: "PORTAL",
      validUntil: closed.endDate,
    },
  });

  console.log(`Карточка «${card.title}» (min=${MIN}, волны), период «${closed.name}» → «${next.name}».`);
  console.log("До переноса: волна 1 (3 чел.) выдана, волна 2 (2 чел. из 3) не набралась.");

  const result = await carryUnfilledGroupSelections(closed.id, actor.id);
  console.log("Результат carryUnfilledGroupSelections:", result);

  check(result.cards === 1, "затронута ровно одна карточка");
  check(result.carried === 2, "перенесено ровно 2 позиции (хвост волны 2)");

  for (const it of wave1Items) {
    const fresh = await db.applicationItem.findUnique({ where: { id: it.id } });
    check(fresh?.status === "COUPON_ISSUED", `волна 1: позиция ${it.id.slice(-6)} осталась COUPON_ISSUED (не тронута)`);
  }
  const wave1Coupons = await db.coupon.findMany({ where: { itemId: { in: wave1Items.map((i) => i.id) } } });
  check(wave1Coupons.every((c) => c.status === "ISSUED"), "волна 1: купоны остались ISSUED (не аннулированы)");
  check(
    (await db.applicationItem.count({ where: { carriedFromId: { in: wave1Items.map((i) => i.id) } } })) === 0,
    "волна 1: для неё НЕ создано переносных позиций",
  );

  const item4Fresh = await db.applicationItem.findUnique({ where: { id: item4.id } });
  check(item4Fresh?.status === "CANCELLED", "волна 2: исходная позиция #4 отменена (CANCELLED)");
  const item5Fresh = await db.applicationItem.findUnique({ where: { id: item5.id } });
  check(item5Fresh?.status === "CANCELLED", "волна 2: исходная позиция #5 отменена (CANCELLED)");
  const coupon5Fresh = await db.coupon.findUnique({ where: { id: coupon5.id } });
  check(coupon5Fresh?.status === "CANCELLED", "волна 2: сформированный купон #5 аннулирован");

  const carried4 = await db.applicationItem.findFirst({ where: { carriedFromId: item4.id } });
  const carried5 = await db.applicationItem.findFirst({ where: { carriedFromId: item5.id } });
  check(!!carried4 && carried4.status === "PENDING", "волна 2: позиция #4 перенесена в следующий период (PENDING)");
  check(!!carried5 && carried5.status === "PENDING", "волна 2: позиция #5 перенесена в следующий период (PENDING)");
  if (carried4) {
    const app = await db.application.findUnique({ where: { id: carried4.applicationId } });
    check(app?.periodId === next.id, "перенесённая позиция #4 принадлежит следующему периоду");
  }

  const result2 = await carryUnfilledGroupSelections(closed.id, actor.id);
  check(result2.carried === 0, "повторный вызов идемпотентен — новых переносов нет");

  console.log(failed ? "\n✗ ЕСТЬ ПРОВАЛЫ" : "\n✓ Все проверки прошли.");
}

async function cleanup() {
  const employees = await db.employee.findMany({ where: { fullName: { startsWith: tag } } });
  const empIds = employees.map((e) => e.id);
  const apps = await db.application.findMany({ where: { employeeId: { in: empIds } } });
  const appIds = apps.map((a) => a.id);
  const items = await db.applicationItem.findMany({ where: { applicationId: { in: appIds } } });
  const itemIds = items.map((i) => i.id);

  const users = await db.user.findMany({ where: { employeeId: { in: empIds } } });
  await db.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await db.coupon.deleteMany({ where: { itemId: { in: itemIds } } });
  await db.applicationItem.deleteMany({ where: { carriedFromId: { in: itemIds } } });
  await db.applicationItem.deleteMany({ where: { id: { in: itemIds } } });
  await db.application.deleteMany({ where: { id: { in: appIds } } });
  await db.benefitCard.deleteMany({ where: { title: tag } });
  await db.period.deleteMany({ where: { name: { startsWith: tag } } });
  await db.employee.deleteMany({ where: { id: { in: empIds } } });
  console.log("Откат тестовых данных выполнен.");
}

main()
  .catch((e) => {
    console.error("ОШИБКА:", e);
    failed = true;
  })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  });
