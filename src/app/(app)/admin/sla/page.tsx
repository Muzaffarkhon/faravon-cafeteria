import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { SlaRuleForm } from "./_form";

export default async function SlaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");

  const rules = await db.slaEscalationRule.findMany({ orderBy: { level: "asc" } });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">SLA-эскалации</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Если позиция заявки висит на согласовании дольше указанного времени, система шлёт
          уведомление «Просроченная заявка» выбранным ролям. Проверка выполняется по расписанию
          (крон-роут <code className="rounded bg-surface-muted px-1">/api/cron/sla-escalations</code>).
          Текст сообщения — в разделе «Уведомления», событие{" "}
          <code className="rounded bg-surface-muted px-1">SLA_ESCALATION</code>.
        </p>
      </div>

      <div className="space-y-4">
        {rules.map((r) => (
          <SlaRuleForm
            key={r.id}
            rule={{
              id: r.id,
              level: r.level,
              afterHours: r.afterHours,
              notifyRoles: r.notifyRoles,
              active: r.active,
            }}
          />
        ))}
        {rules.length === 0 && (
          <p className="text-sm text-ink-subtle">Уровней пока нет — добавьте первый.</p>
        )}
        <SlaRuleForm />
      </div>
    </div>
  );
}
