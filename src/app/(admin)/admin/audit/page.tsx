import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, EmptyState, Table } from "@/components/ui";
import { SmartFilterButton } from "@/components/smart-filter";
import { QuickSearch } from "@/components/quick-search";
import { parseSmartFilterParams, stringFilter, dateFilter, type SmartFilterField } from "@/lib/smart-filter";
import { ITEM_STATUS_LABELS } from "@/lib/application-workflow";
import { COUPON_STATUS_LABELS } from "@/lib/coupon";
import { FEEDBACK_STATUS_LABEL } from "@/lib/feedback";
import {
  BLOCK_LABELS,
  PARTNER_STATUS_LABELS,
  CARD_STATUS_LABELS,
  PERIOD_STATUS_LABELS,
  EMPLOYMENT_STATUS_LABELS,
} from "@/lib/labels";
import { getTranslator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  LOGIN_OK: "Вход",
  LOGIN_FAILED: "Неудачный вход",
  LOGOUT: "Выход",
  PASSWORD_CHANGED: "Смена пароля",
  PASSWORD_CHANGE_FAILED: "Смена пароля — ошибка",
  PASSWORD_ISSUED_BY_ADMIN: "Пароль выдан администратором",
  SESSIONS_REVOKED: "Отзыв сессий",
  OTP_ISSUED: "Выдан одноразовый пароль",
  ID_CODE_ISSUED: "Выдан код идентификации",
  TELEGRAM_LINKED: "Telegram привязан",
  TELEGRAM_UNLINKED: "Telegram отвязан",
  USER_CREATED: "Учётная запись создана",
  USER_DELETED: "Учётная запись удалена",
  USER_TELEGRAM_SET: "Telegram ID изменён",
  USER_ROLES_CHANGED: "Изменены роли",
  USER_PARTNER_CHANGED: "Изменён партнёр учётки",
  USER_EXPORTED: "Реестр выгружен",
  EMPLOYEE_CREATED: "Сотрудник добавлен",
  EMPLOYEE_UPDATED: "Сотрудник изменён",
  EMPLOYEE_DELETED: "Сотрудник удалён",
  EMPLOYEE_CONTACT_CHANGED: "Изменены контакты",
  EMPLOYEES_IMPORTED: "Импорт сотрудников из Excel",
  ITEM_APPROVED: "Позиция одобрена",
  ITEM_REJECTED: "Позиция отклонена",
  ITEM_CANCELLED: "Позиция отменена",
  SELECTION_ADDED: "Льгота выбрана",
  SELECTION_REMOVED: "Выбор льготы отменён",
  APPLICATION_SUBMITTED: "Заявка подана",
  COUPON_CREATED: "Купон сформирован",
  COUPON_ISSUED: "Купон выдан",
  COUPON_DELETED: "Купон удалён",
  COUPON_EXPIRED: "Купон просрочен",
  COUPON_REDEEMED_BY_PROVIDER: "Купон активирован у партнёра",
  COUPON_REGISTRY_EXPORTED: "Реестр купонов выгружен",
  PERIOD_CREATED: "Период создан",
  PERIOD_UPDATED: "Период изменён",
  PERIOD_OPENED: "Период открыт",
  PERIOD_CLOSED: "Период закрыт",
  PERIOD_DELETED: "Период удалён",
  GROUP_SELECTION_CARRIED: "Групповой выбор перенесён на следующий период",
  FLOW_RESET_BY_ADMIN: "Сброс тестового флоу",
  AD_REQUEST_CREATED: "Заявка на рекламу подана",
  AD_REQUEST_REVIEWED: "Заявка на рекламу рассмотрена",
  PARTNER_CREATED: "Партнёр создан",
  PARTNER_UPDATED: "Партнёр изменён",
  PARTNER_DELETED: "Партнёр удалён",
  PARTNER_BANNER_CREATED: "Баннер создан",
  TAXI_PROMO_BROADCAST: "Промокод разослан",
  TAXI_NUMBERS_EXPORTED: "Номера на поездки выгружены",
  RBAC_MATRIX_CHANGED: "Изменена матрица прав",
  SUPPORT_REPLY_SENT: "Ответ в чате поддержки",
  SUPPORT_THREAD_CLOSED: "Диалог поддержки закрыт",
  SUPPORT_QUICK_REPLY_CREATED: "Быстрый ответ добавлен",
  SUPPORT_QUICK_REPLY_UPDATED: "Быстрый ответ изменён",
  SUPPORT_QUICK_REPLY_DELETED: "Быстрый ответ удалён",
  SUPPORT_FAQ_CREATED: "Частый вопрос добавлен",
  SUPPORT_FAQ_UPDATED: "Частый вопрос изменён",
  SUPPORT_FAQ_DELETED: "Частый вопрос удалён",
  FEEDBACK_SUBMITTED: "Обращение отправлено",
  FEEDBACK_STATUS_CHANGED: "Статус обращения изменён",
  CARD_CREATED: "Карточка создана",
  CARD_UPDATED: "Карточка изменена",
  CARD_DELETED: "Карточка удалена",
  CARD_VERSION_RESTORED: "Восстановлена версия карточки",
  TEXTBLOCK_UPDATED: "Текстовый блок изменён",
  SLA_RULE_CREATED: "Правило SLA создано",
  SLA_RULE_UPDATED: "Правило SLA изменено",
  SLA_RULE_DELETED: "Правило SLA удалено",
  NOTIFICATION_TEMPLATE_UPDATED: "Шаблон уведомления изменён",
  NOTIFICATION_TEMPLATE_RESET: "Шаблон уведомления сброшен",
  REPORT_EXPORTED: "Отчёт выгружен",
};

const ENTITY_LABELS: Record<string, string> = {
  User: "Учётная запись",
  Employee: "Сотрудник",
  Application: "Заявка",
  ApplicationItem: "Позиция заявки",
  Coupon: "Купон",
  Period: "Период",
  System: "Система",
  Partner: "Партнёр",
  AdvertisingRequest: "Заявка на рекламу",
  PartnerBanner: "Баннер",
  NotificationTemplate: "Шаблон уведомления",
  RolePermission: "Матрица прав",
  BenefitCard: "Карточка льготы",
  SupportThread: "Диалог поддержки",
  SupportQuickReply: "Быстрый ответ",
  SupportFaq: "Частый вопрос",
  Feedback: "Обращение",
  TextBlock: "Текстовый блок",
  SlaEscalationRule: "Правило SLA",
};

/** Названия полей из JSON-диффа — человеческим языком вместо camelCase. */
const FIELD_LABELS: Record<string, string> = {
  fullName: "ФИО",
  login: "Логин",
  status: "Статус",
  isActive: "Активен",
  telegramId: "Telegram ID",
  roles: "Роли",
  partnerId: "Партнёр",
  count: "Количество",
  reason: "Причина",
  applications: "Заявок",
  coupons: "Купонов",
  feedback: "Обращений",
  cascade: "Каскадно",
  category: "Категория",
  block: "Раздел",
  title: "Название",
  name: "Название",
  phone: "Телефон",
  department: "Подразделение",
  number: "Номер",
  recipients: "Получателей",
};

/** Известные словари статусов из БД — переводим значение, если ключ поля это подразумевает. */
const VALUE_LABEL_MAPS: Record<string, string>[] = [
  ITEM_STATUS_LABELS,
  COUPON_STATUS_LABELS,
  FEEDBACK_STATUS_LABEL,
  BLOCK_LABELS,
  PARTNER_STATUS_LABELS,
  CARD_STATUS_LABELS,
  PERIOD_STATUS_LABELS,
  EMPLOYMENT_STATUS_LABELS,
];

function humanValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (typeof v === "string") {
    for (const map of VALUE_LABEL_MAPS) if (map[v]) return map[v];
    return v;
  }
  if (Array.isArray(v)) return v.map(humanValue).join(", ") || "—";
  return String(v);
}

/** Разбирает oldValue/newValue в читаемые строки «Поле: значение» вместо сырого JSON. */
function humanDiff(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v !== "object" || Array.isArray(v)) return [humanValue(v)];
  return Object.entries(v as Record<string, unknown>).map(
    ([k, val]) => `${FIELD_LABELS[k] ?? k}: ${humanValue(val)}`,
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "audit.view")) redirect("/");

  const t = await getTranslator();
  const sp = await searchParams;

  const SMART_FIELDS: SmartFilterField[] = [
    { key: "actor", label: "Кто", type: "text" },
    {
      key: "action",
      label: t("audit.actionLabel"),
      type: "select",
      options: Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
    },
    {
      key: "entityType",
      label: t("audit.entityTypeLabel"),
      type: "select",
      options: Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label })),
    },
    { key: "entityId", label: t("audit.entityIdLabel"), type: "text" },
    { key: "createdAt", label: "Дата", type: "date" },
  ];
  const smartValues = parseSmartFilterParams(sp, SMART_FIELDS);
  const q = (sp.q ?? "").trim();

  const where: Record<string, unknown> = {
    ...(q
      ? {
          OR: [
            { actor: { is: { login: { contains: q, mode: "insensitive" } } } },
            { entityId: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  if (smartValues.action?.v) where.action = smartValues.action.v;
  if (smartValues.entityType?.v) where.entityType = smartValues.entityType.v;
  const entityIdF = stringFilter(smartValues.entityId);
  if (entityIdF) where.entityId = entityIdF;
  const actorF = stringFilter(smartValues.actor);
  if (actorF) where.actor = { is: { login: actorF } };
  const createdF = dateFilter(smartValues.createdAt);
  if (createdF) where.createdAt = createdF;

  const rows = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { login: true } } },
  });

  // Вместо сырого cuid в колонке «Объект» — логин/ФИО/название, если тип
  // сущности это позволяет узнать одним батч-запросом на тип.
  const idsByType = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.entityId) continue;
    if (!idsByType.has(r.entityType)) idsByType.set(r.entityType, new Set());
    idsByType.get(r.entityType)!.add(r.entityId);
  }
  const entityLabelById = new Map<string, string>();
  const userIds = [...(idsByType.get("User") ?? [])];
  const employeeIds = [...(idsByType.get("Employee") ?? [])];
  const partnerIds = [...(idsByType.get("Partner") ?? [])];
  const [users, employees, partners] = await Promise.all([
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, login: true } }) : [],
    employeeIds.length
      ? db.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, fullName: true } })
      : [],
    partnerIds.length ? db.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true } }) : [],
  ]);
  for (const u of users) entityLabelById.set(u.id, u.login);
  for (const e of employees) entityLabelById.set(e.id, e.fullName);
  for (const p of partners) entityLabelById.set(p.id, p.name);

  return (
    <div data-wide className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <QuickSearch basePath="/admin/audit" sp={sp} placeholder="Кто, ID объекта…" />
        <SmartFilterButton
          basePath="/admin/audit"
          params={sp}
          fields={SMART_FIELDS}
          extraParamKeys={[]}
          presets={[{ id: "all", label: "Все записи", values: null }]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState>{t("audit.empty")}</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table stickyHeader>
            <thead>
              <tr>
                <th>{t("audit.colTime")}</th>
                <th>{t("audit.colWho")}</th>
                <th>{t("audit.colAction")}</th>
                <th>{t("audit.colObject")}</th>
                <th>{t("audit.colChange")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap text-ink-muted" data-numeric>
                    {r.createdAt.toLocaleString("ru-RU")}
                  </td>
                  <td className="text-ink">{r.actor?.login ?? "—"}</td>
                  <td className="text-ink">{ACTION_LABELS[r.action] ?? r.action}</td>
                  <td className="text-ink-muted">
                    {ENTITY_LABELS[r.entityType] ?? r.entityType}
                    {r.entityId && (
                      <div className="text-[11px] text-ink-subtle">
                        {entityLabelById.get(r.entityId) ?? (
                          <span className="font-mono">{r.entityId}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="text-xs text-ink-subtle">
                    {humanDiff(r.oldValue).map((line, i) => (
                      <div key={`old-${i}`} className="text-danger/80">
                        − {line}
                      </div>
                    ))}
                    {humanDiff(r.newValue).map((line, i) => (
                      <div key={`new-${i}`} className="text-success-strong/80">
                        + {line}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
