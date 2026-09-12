import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { DEFAULT_TEMPLATES, NOTIFICATION_EVENTS } from "@/lib/notification-format";
import { TemplateForm } from "./_form";

const HINTS: Record<string, string> = {
  APPLICATION_SUBMITTED: "Согласующим — когда сотрудник подал выбор льгот.",
  ITEM_APPROVED: "Сотруднику — когда согласующий одобрил позицию.",
  ITEM_REJECTED: "Сотруднику — когда согласующий отклонил позицию.",
  COUPON_ISSUED: "Сотруднику — когда купон готов (сформирован и выдан).",
  SLA_ESCALATION: "Ролям из матрицы SLA — когда позиция висит на согласовании дольше срока (раздел «SLA»).",
  SUPPORT_MESSAGE: "Всем C&B — когда в чате поддержки новое сообщение от гостя.",
};

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");

  const rows = await db.notificationTemplate.findMany({
    include: { updatedBy: { select: { login: true, employee: { select: { fullName: true } } } } },
  });
  const byEvent = new Map(rows.map((r) => [r.event, r]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Шаблоны уведомлений</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Тексты сообщений в Telegram. Если шаблон не менялся — используется стандартный.
        </p>
      </div>

      <div className="space-y-4">
        {NOTIFICATION_EVENTS.map((event) => {
          const row = byEvent.get(event);
          const def = DEFAULT_TEMPLATES[event];
          const overridden = !!row && (row.body !== def.body || row.label !== def.label);
          const editedBy = row?.updatedBy?.employee?.fullName ?? row?.updatedBy?.login ?? null;
          const editedAt =
            overridden && row ? row.updatedAt.toLocaleString("ru-RU") : null;
          return (
            <div key={event}>
              {HINTS[event] && <p className="mb-1 text-xs text-ink-subtle">{HINTS[event]}</p>}
              <TemplateForm
                event={event}
                label={row?.label ?? def.label}
                body={row?.body ?? def.body}
                overridden={overridden}
                editedBy={overridden ? editedBy : null}
                editedAt={editedAt}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
