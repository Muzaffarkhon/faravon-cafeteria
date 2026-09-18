/**
 * Тестовые данные для проверки кешбека: партнёр, карточка (кешбек 10%), тестовый
 * сотрудник с выданным купоном и тестовый кассир партнёра.
 *
 *   npx tsx scripts/seed-cashback-test.ts             # создать (идемпотентно)
 *   npx tsx scripts/seed-cashback-test.ts --cleanup   # отключить тестовые данные
 *
 * Логины и одноразово сгенерированные пароли пишутся в `.env.cashback-test` (файл в
 * .gitignore, в консоль пароли не печатаются). Записи журнала кешбека неизменяемы, поэтому
 * «cleanup» НЕ удаляет данные, а выводит их из обращения (архив/неактивны).
 * Работает с базой из DATABASE_URL — то есть, при локальной разработке, с боевой:
 * все объекты помечены префиксом «ТЕСТ».
 */
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { normalizePhone } from "../src/lib/phone";

const db = new PrismaClient();

const PARTNER_NAME = "ТЕСТ Кешбек";
const CARD_TITLE = "ТЕСТ Кешбек 10%";
const EMPLOYEE_NAME = "ТЕСТ Сотрудник Кешбек";
const EMPLOYEE_PHONE = "+992000000771"; // заведомо несуществующий номер
const EMPLOYEE_LOGIN = "test_cb_employee";
const CASHIER_LOGIN = "test_cb_cashier";
const CREDS_FILE = ".env.cashback-test";
const PERIOD_NAME = "ТЕСТ Период кешбека (не открывать)";

const password = () => randomBytes(9).toString("base64url"); // 12 символов [A-Za-z0-9_-]

async function cleanup() {
  const partner = await db.partner.findFirst({ where: { name: PARTNER_NAME } });
  if (partner) {
    await db.partner.update({ where: { id: partner.id }, data: { status: "ARCHIVED" } });
    await db.benefitCard.updateMany({ where: { partnerId: partner.id }, data: { isActive: false, archivedAt: new Date() } });
    await db.user.updateMany({ where: { partnerId: partner.id }, data: { isActive: false } });
  }
  await db.period.updateMany({ where: { name: PERIOD_NAME }, data: { status: "CLOSED" } });
  const emp = await db.employee.findFirst({ where: { fullName: EMPLOYEE_NAME } });
  if (emp) {
    await db.employee.update({ where: { id: emp.id }, data: { isActive: false, archivedAt: new Date() } });
    await db.user.updateMany({ where: { employeeId: emp.id }, data: { isActive: false } });
  }
  console.log("Тестовые данные выведены из обращения (партнёр в архиве, пользователи неактивны).");
}

async function seed() {
  // 0. Тестовый период, в котором купон действует прямо сейчас (начисление кешбека требует, чтобы
  // период уже начался). Это DRAFT с окном выбора в 2099 году: планировщик периодов
  // (period-lifecycle) открывает DRAFT по windowStart ≤ сейчас, так что он никогда не откроется
  // сам и не появится у сотрудников; реальные периоды не затрагиваются.
  const now = new Date();
  const DAY = 24 * 3600_000;
  const period =
    (await db.period.findFirst({ where: { name: PERIOD_NAME } })) ??
    (await db.period.create({
      data: {
        name: PERIOD_NAME,
        status: "DRAFT",
        startDate: new Date(now.getTime() - DAY),
        endDate: new Date(now.getTime() + 60 * DAY),
        windowStart: new Date("2099-01-01T00:00:00Z"),
        windowEnd: new Date("2099-01-05T00:00:00Z"),
        maxSelections: 4,
      },
    }));
  if (period.status === "CLOSED" || period.endDate < now) {
    await db.period.update({
      where: { id: period.id },
      data: { status: "DRAFT", startDate: new Date(now.getTime() - DAY), endDate: new Date(now.getTime() + 60 * DAY) },
    });
    period.status = "DRAFT";
    period.startDate = new Date(now.getTime() - DAY);
    period.endDate = new Date(now.getTime() + 60 * DAY);
  }

  // 1. Партнёр
  const partner =
    (await db.partner.findFirst({ where: { name: PARTNER_NAME } })) ??
    (await db.partner.create({
      data: { name: PARTNER_NAME, category: "Тест", discountType: "Кешбек 10%", terms: "Тестовый партнёр для проверки кешбека", status: "ACTIVE", deliveryMode: "QR" },
    }));
  if (partner.status !== "ACTIVE") await db.partner.update({ where: { id: partner.id }, data: { status: "ACTIVE" } });

  // 2. Карточка + версия v1
  let card = await db.benefitCard.findFirst({ where: { partnerId: partner.id, title: CARD_TITLE } });
  if (!card) {
    card = await db.benefitCard.create({
      data: {
        block: "FLEX",
        title: CARD_TITLE,
        description: "Тестовая льгота: кешбек 10% от оплаченной суммы",
        condition: "Кешбек 10%",
        status: "PUBLISHED",
        isActive: true,
        mode: "CASHBACK",
        cashbackPercent: 10,
        partnerId: partner.id,
      },
    });
    await db.benefitCardVersion.create({
      data: {
        cardId: card.id, version: 1, reason: "created", block: card.block, title: card.title, description: card.description,
        condition: card.condition, imageUrl: null, category: null, isActive: true, status: card.status, sortOrder: card.sortOrder,
        minParticipants: 1, mode: "CASHBACK", cashbackPercent: 10, partnerId: partner.id,
      },
    });
  } else if (card.archivedAt || !card.isActive) {
    card = await db.benefitCard.update({ where: { id: card.id }, data: { archivedAt: null, isActive: true } });
  }

  // 3. Сотрудник (номер проверяем на коллизию с реальным сотрудником)
  const phoneNorm = normalizePhone(EMPLOYEE_PHONE);
  const clash = await db.employee.findFirst({ where: { phoneNormalized: phoneNorm, NOT: { fullName: EMPLOYEE_NAME } } });
  if (clash) throw new Error(`Тестовый номер ${EMPLOYEE_PHONE} уже у сотрудника «${clash.fullName}».`);
  const employee =
    (await db.employee.findFirst({ where: { fullName: EMPLOYEE_NAME } })) ??
    (await db.employee.create({
      data: { fullName: EMPLOYEE_NAME, position: "Тест", department: "Тест", phone: EMPLOYEE_PHONE, phoneNormalized: phoneNorm },
    }));
  if (!employee.isActive || employee.archivedAt) {
    await db.employee.update({ where: { id: employee.id }, data: { isActive: true, archivedAt: null } });
  }

  // 4. Пользователи (пароль генерируется только для новых)
  const creds: string[] = [];
  const ensureUser = async (login: string, data: { roles: ("EMPLOYEE" | "CONTRACTOR")[]; employeeId?: string; partnerId?: string }) => {
    const existing = await db.user.findUnique({ where: { login } });
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: { isActive: true } });
      creds.push(`${login} — уже существует (пароль не менялся)`);
      return;
    }
    const pw = password();
    await db.user.create({ data: { login, passwordHash: await hashPassword(pw), mustChangePassword: false, ...data } });
    creds.push(`${login} / ${pw}`);
  };
  await ensureUser(EMPLOYEE_LOGIN, { roles: ["EMPLOYEE"], employeeId: employee.id });
  await ensureUser(CASHIER_LOGIN, { roles: ["CONTRACTOR"], partnerId: partner.id });

  // 5. Заявка сотрудника и выданный купон-кешбек (со снимком правил)
  const app = await db.application.upsert({
    where: { employeeId_periodId: { employeeId: employee.id, periodId: period.id } },
    create: { employeeId: employee.id, periodId: period.id },
    update: {},
  });
  const item = await db.applicationItem.upsert({
    where: { applicationId_cardId: { applicationId: app.id, cardId: card.id } },
    create: { applicationId: app.id, cardId: card.id, status: "COUPON_ISSUED", submittedAt: now, decidedAt: now },
    update: {},
  });
  let coupon = await db.coupon.findUnique({ where: { itemId: item.id } });
  if (!coupon) {
    const ym = `${period.startDate.getUTCFullYear()}${String(period.startDate.getUTCMonth() + 1).padStart(2, "0")}`;
    coupon = await db.coupon.create({
      data: {
        number: `FRV-${ym}-T${randomBytes(2).toString("hex").toUpperCase()}`,
        itemId: item.id, partnerId: partner.id, employeeId: employee.id, periodId: period.id,
        type: "PROMO", nominal: card.condition, status: "ISSUED", deliveryChannel: "PORTAL", issuedAt: now,
        validUntil: period.endDate, benefitMode: "CASHBACK", cashbackPercent: 10,
      },
    });
  } else if (coupon.status !== "ISSUED") {
    coupon = await db.coupon.update({ where: { id: coupon.id }, data: { status: "ISSUED" } });
  }

  const text = [
    "# Тестовые данные кешбека (файл в .gitignore, не публиковать)",
    `Партнёр: ${PARTNER_NAME}`,
    `Карточка: ${CARD_TITLE}`,
    `Сотрудник: ${EMPLOYEE_NAME}, телефон ${EMPLOYEE_PHONE}`,
    `Купон: ${coupon.number}, действует до ${period.endDate.toISOString().slice(0, 10)}`,
    "",
    "Учётные записи (логин / пароль):",
    ...creds,
    "",
  ].join("\n");
  fs.writeFileSync(CREDS_FILE, text, "utf8");
  console.log(`Готово. Партнёр «${PARTNER_NAME}», карточка «${CARD_TITLE}», купон ${coupon.number}.`);
  console.log(`Логины/пароли записаны в ${CREDS_FILE} (в консоль не печатаются).`);
}

(process.argv.includes("--cleanup") ? cleanup() : seed())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
