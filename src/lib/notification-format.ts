/**
 * Форматирование уведомлений (§5.10). Модуль без server-only —
 * используется и веб-приложением, и Telegram-ботом (bot/notifications.ts),
 * и cron-доставкой.
 *
 * Тексты берутся из редактируемых шаблонов (модель NotificationTemplate). Если
 * строки нет — используется зашитый шаблон по умолчанию из DEFAULT_TEMPLATES.
 * Тела шаблонов — HTML для Telegram (parse_mode=HTML): <b>жирный</b>,
 * <code>моноширинный</code>, перенос строки — обычный \n. Подставляемые
 * значения ({card}, {employee} и т.п.) экранируются автоматически — в самом
 * шаблоне писать `&`, `<`, `>` в теге можно свободно, а в тексте, который
 * может прийти из пользовательских данных (название карточки, ФИО), эти
 * символы никогда не сломают разметку.
 *
 * Синтаксис шаблона:
 *   {name}          — подстановка значения (экранированного); пустое, если значения нет
 *   [[ ... {x} ... ]] — блок удаляется целиком, если {x} внутри пустой
 */

/** Экранирование для Telegram HTML (parse_mode=HTML): только &, <, > значимы. */
export const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Единое сообщение с логином/паролем — при первичной выдаче через бота
 * (linkByPhone/linkByCode/reissueOtp) и при ручной привязке из чата
 * поддержки (linkEmployeeToThread) должно выглядеть одинаково, а не как
 * два разных бота.
 */
export function grantMessage(
  login: string,
  otp: string,
  fullName: string,
  /** false — диалог уже идёт (чат поддержки), приветствие лишнее. */
  greet = true,
): string {
  const platformUrl = process.env.PLATFORM_URL || "";
  return (
    (greet ? `Здравствуйте, ${escHtml(fullName)}!\n\n` : "") +
    `🔑 Логин: <code>${escHtml(login)}</code>\n` +
    `🔒 Одноразовый пароль: <code>${escHtml(otp)}</code>\n\n` +
    `Пароль действует 24 часа и на один вход. При первом входе задайте постоянный пароль.\n` +
    (platformUrl ? `Вход: ${platformUrl}/login` : "")
  );
}

export const NOTIFICATION_LABELS: Record<string, string> = {
  APPLICATION_SUBMITTED: "Новая заявка на согласование",
  ITEM_APPROVED: "Позиция заявки одобрена",
  ITEM_REJECTED: "Позиция заявки отклонена",
  COUPON_ISSUED: "Купон выдан",
  SLA_ESCALATION: "Просроченная заявка на согласовании",
  COUPON_CONFIRMED_BY_PROVIDER: "Купон активирован у партнёра",
  WINDOW_OPEN: "Открыто окно выбора льгот",
  WINDOW_CLOSING: "Окно выбора скоро закроется",
  TAXI_REQUEST_APPROVED: "Одобрена заявка на такси",
  TAXI_APPROVED_EMPLOYEE: "Поездка одобрена — ждите промокод",
  TAXI_PROMO_CODE: "Промокод на поездку",
  DAILY_DIGEST: "Ежедневный отчёт по заявкам",
  GROUP_CARRIED_OVER: "Групповая льгота перенесена на следующий период",
  BROADCAST: "Рассылка от администрации",
  CASHBACK_OPERATION: "Операция по кешбеку",
  CASHBACK_REVERSED: "Операция по кешбеку сторнирована",
};

/** Порядок событий в админке. */
export const NOTIFICATION_EVENTS = [
  "APPLICATION_SUBMITTED",
  "ITEM_APPROVED",
  "ITEM_REJECTED",
  "COUPON_ISSUED",
  "SLA_ESCALATION",
  "COUPON_CONFIRMED_BY_PROVIDER",
  "WINDOW_OPEN",
  "WINDOW_CLOSING",
  "TAXI_REQUEST_APPROVED",
  "TAXI_APPROVED_EMPLOYEE",
  "TAXI_PROMO_CODE",
  "DAILY_DIGEST",
  "GROUP_CARRIED_OVER",
  "BROADCAST",
  "CASHBACK_OPERATION",
  "CASHBACK_REVERSED",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export type NotificationTemplateDef = { label: string; body: string };

/** Зашитые тексты — совпадают с исходным поведением до вынесения в админку. */
export const DEFAULT_TEMPLATES: Record<string, NotificationTemplateDef> = {
  APPLICATION_SUBMITTED: {
    label: NOTIFICATION_LABELS.APPLICATION_SUBMITTED,
    body: "🆕 <b>Новая заявка на согласование</b>\n{employee}[[ · {department}]] — {count} {countNoun}[[\nПериод: {period}]]\n\nОткройте раздел «Согласование».",
  },
  ITEM_APPROVED: {
    label: NOTIFICATION_LABELS.ITEM_APPROVED,
    body: "✅ <b>Позиция одобрена</b>\n«{card}»[[ · {period}]][[\n\nЭто {group} льгота — купон придёт, как только наберётся нужное число участников. Прогресс набора виден в разделе «Мои заявки».]]",
  },
  ITEM_REJECTED: {
    label: NOTIFICATION_LABELS.ITEM_REJECTED,
    body: "❌ <b>Позиция отклонена</b>\n«{card}»[[ · {period}]][[\nПричина: {comment}]]",
  },
  COUPON_ISSUED: {
    label: NOTIFICATION_LABELS.COUPON_ISSUED,
    body: "🎟️ <b>Купон готов</b>\n«{card}»[[ · {period}]][[\n№ <code>{number}</code>]][[\nДействует с {validFrom} до {validUntil}]]\n\nПредъявите его партнёру.[[\n\nПодробнее — в разделе «Мои заявки и купоны»: {siteUrl}/applications]]",
  },
  SLA_ESCALATION: {
    label: NOTIFICATION_LABELS.SLA_ESCALATION,
    body: "⏰ <b>Заявка ждёт решения</b>\n{employee}[[ · {department}]] — «{card}»\nПрошло более {hours} ч (уровень {level})\n\nОткройте раздел «Согласование».",
  },
  COUPON_CONFIRMED_BY_PROVIDER: {
    label: NOTIFICATION_LABELS.COUPON_CONFIRMED_BY_PROVIDER,
    body: "🤝 <b>Купон активирован у партнёра</b>\n«{card}»[[ · {period}]][[\n№ <code>{number}</code>]]",
  },
  WINDOW_OPEN: {
    label: NOTIFICATION_LABELS.WINDOW_OPEN,
    body: "🗓️ <b>Открыто окно выбора льгот</b>[[\nПериод: {period}]]\nВыберите льготы до {windowEnd}.",
  },
  WINDOW_CLOSING: {
    label: NOTIFICATION_LABELS.WINDOW_CLOSING,
    body: "⏳ <b>Окно выбора скоро закроется</b>[[\nПериод: {period}]]\nЗакроется {windowEnd}, а вы ещё не выбрали льготы. Успейте оформить выбор.",
  },
  TAXI_REQUEST_APPROVED: {
    label: NOTIFICATION_LABELS.TAXI_REQUEST_APPROVED,
    body: "🚕 <b>Одобрена заявка на поездки</b>\n{employee}[[ · «{card}»]][[ · {period}]]\nТелефон: <code>{phone}</code>\n\nЗаведите промокод в своей системе и отправьте его сотрудникам через раздел «Промокоды».",
  },
  TAXI_APPROVED_EMPLOYEE: {
    label: NOTIFICATION_LABELS.TAXI_APPROVED_EMPLOYEE,
    body: "✅ <b>Поездка одобрена</b>\n«{card}»[[ · {period}]]\nПромокод на поездку придёт в этот чат от партнёра.",
  },
  TAXI_PROMO_CODE: {
    label: NOTIFICATION_LABELS.TAXI_PROMO_CODE,
    body: "🎟️ <b>Промокод на поездку</b>[[\n«{card}»]][[ · {period}]]\n<code>{promo}</code>[[\n\nПодробнее — в разделе «Мои заявки и купоны»: {siteUrl}/applications]]",
  },
  DAILY_DIGEST: {
    label: NOTIFICATION_LABELS.DAILY_DIGEST,
    body: "📊 <b>Отчёт на начало дня</b>\n{text}",
  },
  GROUP_CARRIED_OVER: {
    label: NOTIFICATION_LABELS.GROUP_CARRIED_OVER,
    body: "🔁 <b>Групповая льгота перенесена</b>\n«{card}» не набрала нужное число участников[[\nПериод: {period}]]\nВаш выбор перенесён на следующий период — отменить его можно в окне выбора этого периода, до его начала.",
  },
  BROADCAST: {
    label: NOTIFICATION_LABELS.BROADCAST,
    body: "📢 <b>Объявление</b>\n{text}",
  },
  CASHBACK_OPERATION: {
    label: NOTIFICATION_LABELS.CASHBACK_OPERATION,
    body: "💳 <b>Покупка с кешбеком</b>\n{partner} — чек {purchase} сом.[[\nСписано кешбека: {redeemed} сом.]][[\nНачислено кешбека: {accrued} сом.]]\nБаланс у партнёра: {balance} сом.\n\nЕсли это были не вы — сообщите в поддержку.",
  },
  CASHBACK_REVERSED: {
    label: NOTIFICATION_LABELS.CASHBACK_REVERSED,
    body: "↩️ <b>Операция по кешбеку сторнирована</b>\n{partner}[[\nПричина: {reason}]]\nБаланс у партнёра: {balance} сом.",
  },
};

/** Демо-значения для предпросмотра шаблона в админке. */
export const TEMPLATE_SAMPLE_VARS: Record<string, Record<string, string>> = {
  APPLICATION_SUBMITTED: {
    employee: "Иванов И.И.",
    department: "Отдел продаж",
    count: "3",
    countNoun: "позиции",
    period: "III квартал 2026",
  },
  ITEM_APPROVED: { card: "Абонемент в бассейн", period: "Сентябрь 2026", group: "групповая" },
  ITEM_REJECTED: { card: "Абонемент в бассейн", comment: "нет бюджета в периоде", period: "Сентябрь 2026" },
  COUPON_ISSUED: {
    card: "Ковры «Кайраккум»",
    number: "К-000123",
    period: "Сентябрь 2026",
    validFrom: "01.09.2026",
    validUntil: "30.09.2026",
    siteUrl: "https://cafeteria.example.com",
  },
  SLA_ESCALATION: {
    employee: "Иванов И.И.",
    department: "Отдел продаж",
    card: "Абонемент в бассейн",
    hours: "72",
    level: "1",
  },
  COUPON_CONFIRMED_BY_PROVIDER: { card: "Ковры «Кайраккум»", number: "FRV-202609-A1B2C3", period: "Сентябрь 2026" },
  WINDOW_OPEN: { period: "III квартал 2026", windowEnd: "30.09.2026" },
  WINDOW_CLOSING: { period: "III квартал 2026", windowEnd: "30.09.2026" },
  TAXI_REQUEST_APPROVED: { employee: "Иванов И.И.", card: "Такси на работу", phone: "+992 900 000 000", period: "Сентябрь 2026" },
  TAXI_APPROVED_EMPLOYEE: { card: "Такси на работу", period: "Сентябрь 2026" },
  TAXI_PROMO_CODE: { card: "Такси на работу", promo: "FRV-TAXI-2026", period: "Сентябрь 2026", siteUrl: "https://cafeteria.example.com" },
  DAILY_DIGEST: { text: "На согласовании: 4\nК выдаче купонов: 2\nЗаявок на рекламу: 1\nНовых обращений: 1" },
  GROUP_CARRIED_OVER: { card: "Абонемент в бассейн (группа)", period: "Октябрь 2026" },
  BROADCAST: { text: "Уважаемые коллеги! 30 сентября — технический перерыв в работе платформы с 22:00 до 23:00." },
  CASHBACK_OPERATION: { partner: "Магазин «Ковры»", purchase: "100,00", redeemed: "30,00", accrued: "7,00", balance: "7,00" },
  CASHBACK_REVERSED: { partner: "Магазин «Ковры»", reason: "ошибка ввода суммы", balance: "0,00" },
};

/** Доступные плейсхолдеры по событию — для подсказки в админке. */
export const TEMPLATE_PLACEHOLDERS: Record<string, string[]> = {
  APPLICATION_SUBMITTED: ["employee", "department", "count", "countNoun", "period"],
  ITEM_APPROVED: ["card", "period", "group"],
  ITEM_REJECTED: ["card", "comment", "period"],
  COUPON_ISSUED: ["card", "number", "period", "validFrom", "validUntil", "siteUrl"],
  SLA_ESCALATION: ["employee", "department", "card", "hours", "level"],
  COUPON_CONFIRMED_BY_PROVIDER: ["card", "number", "period"],
  WINDOW_OPEN: ["period", "windowEnd"],
  WINDOW_CLOSING: ["period", "windowEnd"],
  TAXI_REQUEST_APPROVED: ["employee", "card", "phone", "period"],
  TAXI_APPROVED_EMPLOYEE: ["card", "period"],
  TAXI_PROMO_CODE: ["card", "promo", "period", "siteUrl"],
  DAILY_DIGEST: ["text"],
  GROUP_CARRIED_OVER: ["card", "period"],
  BROADCAST: ["text"],
  CASHBACK_OPERATION: ["partner", "purchase", "redeemed", "accrued", "balance"],
  CASHBACK_REVERSED: ["partner", "reason", "balance"],
};

const str = (v: unknown) => (v == null ? "" : String(v));

/** Русское склонление слова «позиция» по числу. */
export function positionNoun(count: number): string {
  const n = Math.abs(count);
  if (n % 10 === 1 && n % 100 !== 11) return "позицию";
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "позиции";
  return "позиций";
}

/** Строит набор подстановок из payload + производные значения. */
function buildVars(event: string, payload: Record<string, unknown>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v != null && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
      vars[k] = String(v);
    }
  }
  if (event === "APPLICATION_SUBMITTED") {
    vars.countNoun = positionNoun(Number(payload.count) || 0);
  }
  // Доступен во всех шаблонах как {siteUrl} — если PLATFORM_URL не задан,
  // пустой, и блоки [[ ... {siteUrl} ... ]] в шаблонах сами исчезают.
  vars.siteUrl = process.env.PLATFORM_URL || "";
  return vars;
}

/** Подставляет значения в тело шаблона по описанному синтаксису. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  const value = (name: string) => str(vars[name.trim()]);

  // 1. Опциональные блоки [[ ... ]] — убрать, если хоть один {x} внутри пустой.
  let out = body.replace(/\[\[([\s\S]*?)\]\]/g, (_m, inner: string) => {
    const tokens = inner.match(/\{([^}]+)\}/g) ?? [];
    const allFilled = tokens.every((t) => value(t.slice(1, -1)) !== "");
    return allFilled ? inner : "";
  });

  // 2. Обычные подстановки {x} — экранируем: тело шаблона (b/code и т.п.) —
  // доверенная разметка, а вот значения ({card}, {employee}…) могут содержать
  // &, < или > (напр. карточка «Спорт & фитнес») и не должны ломать HTML.
  out = out.replace(/\{([^}]+)\}/g, (_m, name: string) => escHtml(value(name)));

  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Человекочитаемый текст уведомления для Telegram/списка.
 * `templates` — карта event → body из БД (NotificationTemplate); при отсутствии
 * берётся DEFAULT_TEMPLATES, затем — просто метка события.
 */
export function formatNotificationText(
  event: string,
  payload: Record<string, unknown> | null | undefined,
  templates?: Map<string, string> | Record<string, string>,
): string {
  const p = (payload ?? {}) as Record<string, unknown>;

  const fromMap =
    templates instanceof Map
      ? templates.get(event)
      : templates
        ? templates[event]
        : undefined;
  const body = fromMap ?? DEFAULT_TEMPLATES[event]?.body;
  if (!body) return NOTIFICATION_LABELS[event] ?? event;

  return renderTemplate(body, buildVars(event, p));
}
