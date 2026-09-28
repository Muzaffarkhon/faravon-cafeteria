/**
 * Нагрузочный тест колеса подарков: N сотрудников крутят одновременно за K купонов —
 * выдано должно быть ровно K; двойной клик одного сотрудника — одна прокрутка.
 *
 * Запуск ТОЛЬКО на песочнице/локальной БД (скрипт сам проверяет DATABASE_URL):
 *   set -a; . ../faravon-cafeteria-sandbox/.env; set +a
 *   npx tsx --conditions=react-server scripts/wheel-concurrency-test.ts
 *
 * Берёт сотрудников без Telegram (уведомления о купоне никому не уйдут) и в конце
 * точечно откатывает всё, что создал: прокрутки, позиции, купоны, уведомления,
 * монеты, листки и настройки колеса.
 */
import { PrismaClient } from "@prisma/client";
import { spinWheel, getWheelState } from "../src/lib/wheel";
import { resolveSelectionContext } from "../src/lib/selection";
import { dushanbeDateKey } from "../src/lib/dushanbe-date";

const url = process.env.DATABASE_URL ?? "";
if (!/schema=test|localhost|127\.0\.0\.1/.test(url)) {
  console.error("Отказ: это не песочница (schema=test) и не локальная БД.");
  process.exit(1);
}

const N = 30;
const K = 3;
const db = new PrismaClient();
let failed = false;
const check = (cond: unknown, msg: string) => {
  console.log(`  ${cond ? "✓" : "✗ ПРОВАЛ:"} ${msg}`);
  if (!cond) failed = true;
};

async function main() {
  const ctx = await resolveSelectionContext();
  const period = ctx.targetPeriod;
  if (!period) throw new Error("В песочнице нет периода для выбора — купон некуда положить.");

  const card = await db.benefitCard.findFirst({
    where: {
      status: "PUBLISHED",
      isActive: true,
      archivedAt: null,
      minParticipants: 1,
      partner: { is: { deliveryMode: "QR" } },
    },
  });
  if (!card) throw new Error("Нет подходящей льготы (QR, не групповая, опубликована).");

  const dayKey = dushanbeDateKey();
  if (!(await db.user.findFirst({ where: { roles: { has: "C_AND_B" } } }))) throw new Error("Нет пользователя C&B.");
  // Временные сотрудники без Telegram и без учётки — уведомления о купоне никуда не уйдут.
  const tag = `ТЕСТ колесо ${Date.now()}`;
  await db.employee.createMany({
    data: Array.from({ length: N + 1 }, (_, i) => ({ fullName: `${tag} #${i + 1}`, position: "Тест", department: "Тест колеса" })),
  });
  const employees = await db.employee.findMany({ where: { fullName: { startsWith: tag } }, orderBy: { seq: "asc" } });
  const actor = await db.user.findFirst({ where: { roles: { has: "C_AND_B" } } });
  if (!actor) throw new Error("Нет пользователя C&B.");

  console.log(`Период «${period.name}», льгота «${card.title}», ${N} сотрудников, купонов ${K}.`);

  const settingsBefore = await db.gamificationSettings.findUnique({ where: { id: "default" } });
  const sectorsBefore = await db.wheelSector.findMany({ where: { isActive: true }, select: { id: true } });
  const startedAt = new Date();

  await db.wheelSector.updateMany({ where: { id: { in: sectorsBefore.map((s) => s.id) } }, data: { isActive: false } });
  // Геймификация выключена намеренно: колесо должно работать без неё.
  await db.gamificationSettings.upsert({
    where: { id: "default" },
    create: { id: "default", enabled: false, wheelEnabled: true, wheelSpinCost: 0 },
    update: { enabled: false, wheelEnabled: true, wheelSpinCost: 0 },
  });
  // Купон почти гарантированно выбирается первым — так все N бьются за K мест.
  const couponSector = await db.wheelSector.create({
    data: { position: 1, kind: "COUPON", cardId: card.id, quantity: K, weight: 1_000_000 },
  });
  const coinSector = await db.wheelSector.create({ data: { position: 2, kind: "COINS", coins: 1, weight: 1 } });

  try {
    console.log(`\n1) ${N} одновременных прокруток за ${K} купона`);
    const runners = employees.slice(0, N);
    const results = await Promise.allSettled(runners.map((e) => spinWheel(e.id, actor.id)));
    const okResults = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const errors = results.flatMap((r) => (r.status === "rejected" ? [String(r.reason?.message ?? r.reason)] : []));
    const couponWins = okResults.filter((r) => r.kind === "COUPON").length;
    const sector = await db.wheelSector.findUniqueOrThrow({ where: { id: couponSector.id } });
    const coupons = await db.coupon.count({ where: { item: { is: { viaWheel: true, cardId: card.id } }, createdAt: { gte: startedAt } } });
    console.log(`     успешно: ${okResults.length}, ошибок: ${errors.length}, купонов выиграно: ${couponWins}`);
    if (errors.length) console.log(`     ошибки: ${[...new Set(errors)].join(" | ")}`);
    check(couponWins === K, `выиграно ровно ${K} купона (а не больше)`);
    check(sector.wonCount === K, `счётчик листка = ${K}`);
    check(coupons === K, `в реестре ровно ${K} купона`);
    check(errors.length === 0, "все прокрутки прошли, без таймаутов");
    check(okResults.filter((r) => r.kind === "COINS").length === okResults.length - K, "остальные получили монеты");

    console.log("\n2) Повторная прокрутка того же сотрудника сегодня");
    const spunIdx = results.findIndex((r) => r.status === "fulfilled");
    const again = await spinWheel(runners[spunIdx].id, actor.id).then(() => "прошла", (e: Error) => e.message);
    check(again !== "прошла", `отклонена: «${again}»`);

    console.log("\n3) Двойной клик — 5 одновременных запросов одного сотрудника");
    const extra = employees[N];
    const burst = await Promise.allSettled(Array.from({ length: 5 }, () => spinWheel(extra.id, actor.id)));
    const burstOk = burst.filter((r) => r.status === "fulfilled").length;
    const spinsOfExtra = await db.wheelSpin.count({ where: { employeeId: extra.id, dayKey } });
    check(burstOk === 1 && spinsOfExtra === 1, `засчитана одна прокрутка (успешно ${burstOk}, записей ${spinsOfExtra})`);

    console.log("\n4) Победитель не может выиграть тот же купон ещё раз в периоде");
    await db.wheelSector.update({ where: { id: couponSector.id }, data: { quantity: K + 10 } });
    const winnerSpin = await db.wheelSpin.findFirst({ where: { sectorId: couponSector.id, kind: "COUPON", createdAt: { gte: startedAt } } });
    const winnerState = await getWheelState(winnerSpin!.employeeId);
    const block = winnerState.sectors.find((s) => s.id === couponSector.id)?.block;
    check(block === "taken", `для победителя листок помечен «Уже ваша» (block=${block})`);
  } finally {
    console.log("\nОткат тестовых данных…");
    // Всё, что висит на временных сотрудниках, и сами сотрудники.
    const empIds = employees.map((e) => e.id);
    await db.coupon.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.wheelSpin.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.application.deleteMany({ where: { employeeId: { in: empIds } } }); // позиции удаляются каскадом
    await db.coinEntry.deleteMany({ where: { account: { is: { employeeId: { in: empIds } } } } });
    await db.coinAccount.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.autoPick.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.employee.deleteMany({ where: { id: { in: empIds } } });
    await db.wheelSector.deleteMany({ where: { id: { in: [couponSector.id, coinSector.id] } } });
    await db.wheelSector.updateMany({ where: { id: { in: sectorsBefore.map((s) => s.id) } }, data: { isActive: true } });
    await db.gamificationSettings.upsert({
      where: { id: "default" },
      create: { id: "default", enabled: false },
      update: {
        enabled: settingsBefore?.enabled ?? false,
        wheelEnabled: settingsBefore?.wheelEnabled ?? false,
        wheelSpinCost: settingsBefore?.wheelSpinCost ?? 0,
      },
    });
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
