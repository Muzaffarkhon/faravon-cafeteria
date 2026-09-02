/**
 * Форматирование уведомлений (§5.10). Модуль без server-only —
 * используется и веб-приложением, и Telegram-ботом (bot/notifications.ts),
 * и cron-доставкой.
 *
 * Тексты берутся из редактируемых шаблонов (модель NotificationTemplate). Если
 * строки нет — используется зашитый шаблон по умолчанию из DEFAULT_TEMPLATES.
 *
 * Синтаксис шаблона:
 *   {name}          — подстановка значения; пустое, если значения нет
 *   [[ ... {x} ... ]] — блок удаляется целиком, если {x} внутри пустой
 */

export const NOTIFICATION_LABELS: Record<string, string> = {
  APPLICATION_SUBMITTED: "Новая заявка на согласование",
  ITEM_APPROVED: "Позиция заявки одобрена",
  ITEM_REJECTED: "Позиция заявки отклонена",
  COUPON_CREATED: "Купон сформирован",
  COUPON_ISSUED: "Купон выдан",
  SLA_ESCALATION: "Просроченная заявка на согласовании",
  COUPON_CONFIRMED_BY_PROVIDER: "Купон активирован у партнёра",
  WINDOW_OPEN: "Открыто окно выбора льгот",
  WINDOW_CLOSING: "Окно выбора скоро закроется",
};

/** Порядок событий в админке. */
export const NOTIFICATION_EVENTS = [
  "APPLICATION_SUBMITTED",
  "ITEM_APPROVED",
  "ITEM_REJECTED",
  "COUPON_CREATED",
  "COUPON_ISSUED",
  "SLA_ESCALATION",
  "COUPON_CONFIRMED_BY_PROVIDER",
  "WINDOW_OPEN",
  "WINDOW_CLOSING",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export type NotificationTemplateDef = { label: string; body: string };

/** Зашитые тексты — совпадают с исходным поведением до вынесения в админку. */
export const DEFAULT_TEMPLATES: Record<string, NotificationTemplateDef> = {
  APPLICATION_SUBMITTED: {
    label: NOTIFICATION_LABELS.APPLICATION_SUBMITTED,
    body: "{employee}[[, {department}]] подал(а) на согласование {count} {countNoun}[[ (период: {period})]]. Откройте раздел «Согласование».",
  },
  ITEM_APPROVED: {
    label: NOTIFICATION_LABELS.ITEM_APPROVED,
    body: "Ваша позиция «{card}» одобрена согласующим.",
  },
  ITEM_REJECTED: {
    label: NOTIFICATION_LABELS.ITEM_REJECTED,
    body: "Ваша позиция «{card}» отклонена.[[ Причина: {comment}]]",
  },
  COUPON_CREATED: {
    label: NOTIFICATION_LABELS.COUPON_CREATED,
    body: "По льготе «{card}» сформирован купон[[ № {number}]].",
  },
  COUPON_ISSUED: {
    label: NOTIFICATION_LABELS.COUPON_ISSUED,
    body: "Купон[[ № {number}]] по льготе «{card}» выдан.",
  },
  SLA_ESCALATION: {
    label: NOTIFICATION_LABELS.SLA_ESCALATION,
    body: "Заявка {employee}[[, {department}]] по льготе «{card}» ждёт решения больше {hours} ч (уровень {level}). Откройте раздел «Согласование».",
  },
  COUPON_CONFIRMED_BY_PROVIDER: {
    label: NOTIFICATION_LABELS.COUPON_CONFIRMED_BY_PROVIDER,
    body: "Купон[[ № {number}]] по льготе «{card}» активирован у партнёра.",
  },
  WINDOW_OPEN: {
    label: NOTIFICATION_LABELS.WINDOW_OPEN,
    body: "Открыто окно выбора льгот[[ на период «{period}»]]. Выберите льготы до {windowEnd}.",
  },
  WINDOW_CLOSING: {
    label: NOTIFICATION_LABELS.WINDOW_CLOSING,
    body: "Окно выбора[[ на период «{period}»]] закроется {windowEnd}, а вы ещё не выбрали льготы. Успейте оформить выбор.",
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
  ITEM_APPROVED: { card: "Абонемент в бассейн" },
  ITEM_REJECTED: { card: "Абонемент в бассейн", comment: "нет бюджета в периоде" },
  COUPON_CREATED: { card: "Ковры «Кайраккум»", number: "К-000123" },
  COUPON_ISSUED: { card: "Ковры «Кайраккум»", number: "К-000123" },
  SLA_ESCALATION: {
    employee: "Иванов И.И.",
    department: "Отдел продаж",
    card: "Абонемент в бассейн",
    hours: "72",
    level: "1",
  },
  COUPON_CONFIRMED_BY_PROVIDER: { card: "Ковры «Кайраккум»", number: "FRV-202609-A1B2C3" },
  WINDOW_OPEN: { period: "III квартал 2026", windowEnd: "30.09.2026" },
  WINDOW_CLOSING: { period: "III квартал 2026", windowEnd: "30.09.2026" },
};

/** Доступные плейсхолдеры по событию — для подсказки в админке. */
export const TEMPLATE_PLACEHOLDERS: Record<string, string[]> = {
  APPLICATION_SUBMITTED: ["employee", "department", "count", "countNoun", "period"],
  ITEM_APPROVED: ["card"],
  ITEM_REJECTED: ["card", "comment"],
  COUPON_CREATED: ["card", "number"],
  COUPON_ISSUED: ["card", "number"],
  SLA_ESCALATION: ["employee", "department", "card", "hours", "level"],
  COUPON_CONFIRMED_BY_PROVIDER: ["card", "number"],
  WINDOW_OPEN: ["period", "windowEnd"],
  WINDOW_CLOSING: ["period", "windowEnd"],
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

  // 2. Обычные подстановки {x}.
  out = out.replace(/\{([^}]+)\}/g, (_m, name: string) => value(name));

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
