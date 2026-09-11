import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, EmptyState, Input, PageHeader, Select, Table, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  LOGIN_OK: "Вход",
  LOGIN_FAILED: "Неудачный вход",
  LOGOUT: "Выход",
  PASSWORD_CHANGED: "Смена пароля",
  PASSWORD_CHANGE_FAILED: "Смена пароля — ошибка",
  SESSIONS_REVOKED: "Отзыв сессий",
  OTP_ISSUED: "Выдан одноразовый пароль",
  ID_CODE_ISSUED: "Выдан код идентификации",
  TELEGRAM_LINKED: "Telegram привязан",
  TELEGRAM_UNLINKED: "Telegram отвязан",
  USER_CREATED: "Учётная запись создана",
  USER_ROLES_CHANGED: "Изменены роли",
  USER_PARTNER_CHANGED: "Изменён партнёр учётки",
  EMPLOYEE_CREATED: "Сотрудник добавлен",
  EMPLOYEE_UPDATED: "Сотрудник изменён",
  EMPLOYEE_CONTACT_CHANGED: "Изменены контакты",
  ITEM_APPROVED: "Позиция одобрена",
  ITEM_REJECTED: "Позиция отклонена",
  ITEM_CANCELLED: "Позиция отменена",
  COUPON_CREATED: "Купон сформирован",
  COUPON_ISSUED: "Купон выдан",
  COUPON_DELETED: "Купон удалён",
  COUPON_EXPIRED: "Купон просрочен",
  COUPON_REDEEMED_BY_PROVIDER: "Купон активирован у партнёра",
  PERIOD_DELETED: "Период удалён",
  FLOW_RESET_BY_ADMIN: "Сброс тестового флоу",
  AD_REQUEST_CREATED: "Заявка на рекламу подана",
  AD_REQUEST_REVIEWED: "Заявка на рекламу рассмотрена",
  PARTNER_BANNER_CREATED: "Баннер создан",
  RBAC_MATRIX_CHANGED: "Изменена матрица прав",
};

const ENTITY_LABELS: Record<string, string> = {
  User: "Учётная запись",
  Employee: "Сотрудник",
  ApplicationItem: "Позиция заявки",
  Coupon: "Купон",
  Period: "Период",
  System: "Система",
  AdvertisingRequest: "Заявка на рекламу",
  PartnerBanner: "Баннер",
  NotificationTemplate: "Шаблон уведомления",
  RolePermission: "Матрица прав",
  BenefitCard: "Карточка льготы",
};

const short = (v: unknown) => {
  if (v == null) return "";
  const s = JSON.stringify(v);
  return s.length > 90 ? s.slice(0, 90) + "…" : s;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entityType?: string; q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "audit.view")) redirect("/");

  const sp = await searchParams;
  const where: Record<string, unknown> = {};
  if (sp.action) where.action = sp.action;
  if (sp.entityType) where.entityType = sp.entityType;
  if (sp.q) where.entityId = sp.q.trim();

  const rows = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { login: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="История изменений"
        description="Журнал действий: кто, что и когда. Показаны последние 200 записей."
      />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-ink-muted">Действие</span>
          <Select name="action" defaultValue={sp.action ?? ""} className="w-56 py-1.5 text-sm">
            <option value="">все</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-ink-muted">Тип объекта</span>
          <Select name="entityType" defaultValue={sp.entityType ?? ""} className="w-48 py-1.5 text-sm">
            <option value="">все</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-ink-muted">ID объекта</span>
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="cuid…" className="w-56 py-1.5 text-sm font-mono" />
        </label>
        <button className={buttonClass({ variant: "secondary", size: "sm" })}>Показать</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState>Записей нет.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table stickyHeader>
            <thead>
              <tr>
                <th>Время</th>
                <th>Кто</th>
                <th>Действие</th>
                <th>Объект</th>
                <th>Изменение</th>
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
                      <div className="font-mono text-[10px] text-ink-subtle">{r.entityId}</div>
                    )}
                  </td>
                  <td className="font-mono text-[11px] text-ink-subtle">
                    {r.oldValue != null && <div>− {short(r.oldValue)}</div>}
                    {r.newValue != null && <div>+ {short(r.newValue)}</div>}
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
