import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
import { SlaRuleForm } from "./_form";

export default async function SlaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const rules = await db.slaEscalationRule.findMany({ orderBy: { level: "asc" } });
  const lastEdits = await lastEditsFor("SlaEscalationRule", rules.map((r) => r.id));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{t("sla.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          {t("sla.hintPrefix")} <code className="rounded bg-surface-muted px-1">/api/cron/sla-escalations</code>
          {t("sla.hintMiddle")}{" "}
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
              lastEdit: formatLastEdit(lastEdits.get(r.id), r.updatedAt),
            }}
            locale={locale}
          />
        ))}
        {rules.length === 0 && (
          <p className="text-sm text-ink-subtle">{t("sla.noLevels")}</p>
        )}
        <SlaRuleForm locale={locale} />
      </div>
    </div>
  );
}
