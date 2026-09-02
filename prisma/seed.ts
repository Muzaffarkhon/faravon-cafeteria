import { PrismaClient, Block, PartnerStatus, PeriodStatus, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_TEMPLATES } from "../src/lib/notification-format";

const db = new PrismaClient();

async function main() {
  console.log("Seeding…");

  // ---- Text blocks (ТЗ v2 §5.3, §5.6) ----
  await db.textBlock.upsert({
    where: { key: "GOAL" },
    update: {},
    create: {
      key: "GOAL",
      title: "Цель программы",
      content:
        "«Кафетерий льгот» создан, чтобы каждый сотрудник «Фаровон» мог видеть заботу компании и сам выбирать льготы, которые важны именно ему. Мы развиваем культуру признания и поддержки на всех этапах работы в компании.",
    },
  });
  await db.textBlock.upsert({
    where: { key: "NOVELTY_NOTICE" },
    update: {},
    create: {
      key: "NOVELTY_NOTICE",
      title: "Проект на старте",
      content:
        "Проект новый и находится на начальном этапе реализации. Мы будем постепенно расширять список партнёров и улучшать условия льгот для сотрудников.",
    },
  });

  // ---- Partners (ТЗ v2 §5.9) ----
  const partnerData = [
    { key: "musaffo", name: "Тренажёрный зал «Мусаффо»", category: "Спорт", discountType: "Скидка до 30%" },
    { key: "kayrakkum", name: "Ковры «Кайраккум»", category: "Товары для дома", discountType: "Скидка до 30%" },
    { key: "khurshed", name: "Магазин «Хуршед»", category: "Розница", discountType: "Скидка 10% от 500 сомони" },
    { key: "stt", name: "Продукция собственного производства СТТ", category: "Продукты", discountType: "Скидочный купон" },
    { key: "bunyodi", name: "Магазин «Бунёди Манзил»", category: "Стройматериалы", discountType: "Скидка до 5%" },
    { key: "lukmoni", name: "«Лукмони Хаким»", category: "Медицина", discountType: "Скидка 10% на услуги" },
    { key: "sahovat", name: "Сеть аптек «Саховат»", category: "Аптеки", discountType: "Скидка 5%" },
    { key: "sugdiyon", name: "Бассейн «Сугдиён»", category: "Спорт", discountType: "Скидка 20%" },
    { key: "academy", name: "Курсы Академии «Фаровон»", category: "Обучение", discountType: "Скидка до 30%" },
    { key: "istiklol", name: "Бассейн «Истиклолият»", category: "Спорт", discountType: "Скидка 50%" },
    { key: "amid", name: "«Амид»", category: "—", discountType: "—", status: PartnerStatus.SOON },
  ];

  const partners: Record<string, string> = {};
  for (const p of partnerData) {
    const rec = await db.partner.upsert({
      where: { id: p.key },
      update: {},
      create: {
        id: p.key,
        name: p.name,
        category: p.category,
        discountType: p.discountType,
        status: p.status ?? PartnerStatus.ACTIVE,
      },
    });
    partners[p.key] = rec.id;
  }

  // ---- Flexible benefit cards (ТЗ v2 §5.6) ----
  const flex = [
    { partner: "musaffo", title: "Тренажёрный зал «Мусаффо»", condition: "скидка до 30%" },
    { partner: "kayrakkum", title: "Ковры «Кайраккум»", condition: "скидка до 30%" },
    { partner: "khurshed", title: "Магазин «Хуршед»", condition: "скидка 10% при покупке от 500 сомони (по общему чеку за месяц)" },
    { partner: "stt", title: "Продукция собственного производства СТТ", condition: "скидочный купон на месяц" },
    { partner: "bunyodi", title: "Магазин «Бунёди Манзил»", condition: "скидка до 5% (цены изначально ниже рыночных)" },
    { partner: "lukmoni", title: "«Лукмони Хаким»", condition: "скидка 10% на услуги, бесплатные консультации, приоритетное обслуживание" },
    { partner: "sahovat", title: "Сеть аптек «Саховат»", condition: "скидка 5%" },
    { partner: "sugdiyon", title: "Бассейн «Сугдиён»", condition: "скидка 20% на месячное посещение" },
    { partner: "academy", title: "Курсы Академии «Фаровон»", condition: "скидка до 30%" },
    { partner: "istiklol", title: "Бассейн «Истиклолият»", condition: "скидка 50%" },
    { partner: "amid", title: "«Амид»", condition: "скоро (в разработке)", isActive: false },
  ];
  await db.benefitCard.deleteMany({});
  for (let i = 0; i < flex.length; i++) {
    const c = flex[i];
    await db.benefitCard.create({
      data: {
        block: Block.FLEX,
        title: c.title,
        condition: c.condition,
        isActive: c.isActive ?? true,
        sortOrder: i,
        partnerId: partners[c.partner],
      },
    });
  }

  // ---- Recognition programs (ТЗ v2 §5.4) ----
  const recognition = [
    { title: "Выплата наставнику", description: "Вознаграждение за успешное сопровождение нового сотрудника в адаптационный период" },
    { title: "«Юбилейная выплата 50+»", description: "Признание сотрудников, отмечающих юбилей (50 лет и более)" },
    { title: "Велком-бокс", description: "Подарочный набор сотрудникам, успешно прошедшим испытательный срок" },
  ];
  for (let i = 0; i < recognition.length; i++) {
    await db.benefitCard.create({
      data: { block: Block.RECOGNITION, title: recognition[i].title, description: recognition[i].description, sortOrder: i },
    });
  }

  // ---- Care showcase (ТЗ v2 §5.5) ----
  const care = [
    "Служебный транспорт",
    "Обед / питание",
    "Продукция компании к праздникам",
    "Корпоративные мероприятия",
    "Выплата при заключении брака",
    "Материальная помощь при утрате близких родственников",
  ];
  for (let i = 0; i < care.length; i++) {
    await db.benefitCard.create({ data: { block: Block.CARE, title: care[i], sortOrder: i } });
  }

  // ---- Стартовая версия (v1) для карточек без истории ----
  for (const card of await db.benefitCard.findMany()) {
    const has = await db.benefitCardVersion.count({ where: { cardId: card.id } });
    if (has > 0) continue;
    await db.benefitCardVersion.create({
      data: {
        cardId: card.id,
        version: 1,
        reason: "created",
        block: card.block,
        title: card.title,
        description: card.description,
        condition: card.condition,
        imageUrl: card.imageUrl,
        category: card.category,
        isActive: card.isActive,
        status: card.status,
        sortOrder: card.sortOrder,
        partnerId: card.partnerId,
      },
    });
  }

  // ---- Period with an open selection window (ТЗ v2 §5.7) ----
  const now = new Date("2026-08-01T00:00:00Z");
  const monthStart = new Date(Date.UTC(2026, 7, 1));
  const monthEnd = new Date(Date.UTC(2026, 7, 31, 23, 59, 59));
  await db.period.upsert({
    where: { id: "period-2026-08" },
    update: { status: PeriodStatus.OPEN },
    create: {
      id: "period-2026-08",
      name: "Август 2026",
      startDate: monthStart,
      endDate: monthEnd,
      windowStart: monthStart,
      windowEnd: monthEnd,
      status: PeriodStatus.OPEN,
      maxSelections: 4,
    },
  });
  void now;

  // ---- Users & employees ----
  const pass = await bcrypt.hash("Password1", 12);

  async function makeStaff(
    login: string,
    roles: Role[],
    fullName: string,
    position: string,
    partnerId: string | null = null,
  ) {
    await db.user.upsert({
      where: { login },
      update: { roles, partnerId },
      create: { login, passwordHash: pass, mustChangePassword: false, roles, partnerId },
    });
    void fullName;
    void position;
  }
  await makeStaff("c_and_b", [Role.C_AND_B], "Админ C&B", "Контент и привилегии");
  // Глобальный подрядчик без привязки — гасит купоны любого партнёра.
  await makeStaff("contractor", [Role.CONTRACTOR], "Подрядчик", "Вендор / провайдер");
  // Подрядчик на каждого активного партнёра: логин p_<slug>, гасит только свои купоны.
  for (const p of partnerData) {
    if ((p.status ?? PartnerStatus.ACTIVE) !== PartnerStatus.ACTIVE) continue;
    await makeStaff(
      `p_${p.key}`,
      [Role.CONTRACTOR],
      `Подрядчик — ${p.name}`,
      "Вендор партнёра",
      partners[p.key],
    );
  }

  const employees = [
    { login: "ivanov", fullName: "Иванов Иван Иванович", position: "Менеджер по продажам", department: "Коммерческий отдел", phone: "+992 900 111 001" },
    { login: "petrova", fullName: "Петрова Мария Сергеевна", position: "Бухгалтер", department: "Финансовый отдел", phone: "+992 900 111 002" },
    { login: "sidorov", fullName: "Сидоров Пётр Алексеевич", position: "Инженер", department: "Производство", phone: "+992 900 111 003" },
  ];
  for (const e of employees) {
    const existing = await db.employee.findFirst({ where: { fullName: e.fullName } });
    const emp = existing
      ? await db.employee.update({ where: { id: existing.id }, data: { phone: e.phone } })
      : await db.employee.create({
          data: {
            fullName: e.fullName,
            position: e.position,
            department: e.department,
            phone: e.phone,
          },
        });
    await db.user.upsert({
      where: { login: e.login },
      update: { employeeId: emp.id },
      create: { login: e.login, passwordHash: pass, mustChangePassword: false, roles: [Role.EMPLOYEE], employeeId: emp.id },
    });
  }

  // ---- Шаблоны уведомлений (§5.10) ----
  for (const [event, def] of Object.entries(DEFAULT_TEMPLATES)) {
    await db.notificationTemplate.upsert({
      where: { event },
      update: {}, // не затираем правки контент-менеджера
      create: { event, label: def.label, body: def.body },
    });
  }

  // ---- Матрица SLA-эскалаций (§5.12) ----
  const slaDefaults = [
    { level: 1, afterHours: 72, notifyRoles: [Role.C_AND_B], active: true },
    { level: 2, afterHours: 120, notifyRoles: [Role.C_AND_B], active: true },
  ];
  for (const rule of slaDefaults) {
    await db.slaEscalationRule.upsert({
      where: { level: rule.level },
      update: {}, // не затираем настройку
      create: rule,
    });
  }

  // ---- Демо-баннер партнёра для билборда на дашборде ----
  const demoBannerTitle = "Тренажёрный зал «Мусаффо» — скидка до 30%";
  const hasDemoBanner = await db.partnerBanner.findFirst({ where: { title: demoBannerTitle } });
  if (!hasDemoBanner) {
    await db.partnerBanner.create({
      data: {
        title: demoBannerTitle,
        subtitle: "Для сотрудников «Фаровон» — по купону из кафетерия льгот",
        partnerId: partners.musaffo ?? null,
        href: null,
        isActive: true,
        sortOrder: 0,
      },
    });
  }

  console.log(
    "Seed done. Logins: c_and_b / contractor / p_<партнёр> (напр. p_musaffo) / ivanov / petrova / sidorov — password: Password1",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
