import { redirect } from "next/navigation";
import { MessagesTabs } from "@/components/messages-tabs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { DEFAULT_TEMPLATES, NOTIFICATION_EVENTS } from "@/lib/notification-format";
import { DEFAULT_TEMPLATES_I18N } from "@/lib/notification-i18n";
import { getLocale, getTranslator } from "@/lib/i18n";
import { TemplateForm } from "./_form";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const HINTS: Record<string, string> = {
    APPLICATION_SUBMITTED: t("notifications.hintApplicationSubmitted"),
    ITEM_APPROVED: t("notifications.hintItemApproved"),
    ITEM_REJECTED: t("notifications.hintItemRejected"),
    COUPON_ISSUED: t("notifications.hintCouponIssued"),
    SLA_ESCALATION: t("notifications.hintSlaEscalation"),
    BROADCAST: t("notifications.hintBroadcast"),
  };

  const rows = await db.notificationTemplate.findMany({
    include: { updatedBy: { select: { login: true, employee: { select: { fullName: true } } } } },
  });
  const byEvent = new Map(rows.map((r) => [r.event, r]));

  return (
    <div className="space-y-5">
      <MessagesTabs active="notifications" />
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{t("notifications.title")}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t("notifications.hint")}
        </p>
      </div>

      <div className="space-y-4">
        {NOTIFICATION_EVENTS.map((event) => {
          const row = byEvent.get(event);
          const def = DEFAULT_TEMPLATES[event];
          const tr = (row?.translations ?? {}) as { tg?: string; uz?: string };
          const overridden = !!row && (row.body !== def.body || row.label !== def.label || !!tr.tg || !!tr.uz);
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
                bodyTg={tr.tg ?? DEFAULT_TEMPLATES_I18N.tg[event] ?? ""}
                bodyUz={tr.uz ?? DEFAULT_TEMPLATES_I18N.uz[event] ?? ""}
                overridden={overridden}
                editedBy={overridden ? editedBy : null}
                editedAt={editedAt}
                locale={locale}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
