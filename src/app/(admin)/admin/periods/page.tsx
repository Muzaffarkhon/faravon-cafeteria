import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { periodStatusLabel } from "@/lib/labels";
import { Badge, buttonClass, type BadgeTone } from "@/components/ui";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
import { PeriodActions, ResetFlowButton } from "./_status-buttons";

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  OPEN: "success",
  CLOSED: "neutral",
};

const fmt = (d: Date) => d.toLocaleDateString("ru-RU");

export default async function PeriodsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "periods.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const periods = await db.period.findMany({
    include: { _count: { select: { applications: true } } },
    orderBy: { startDate: "desc" },
  });
  const lastEdits = await lastEditsFor("Period", periods.map((p) => p.id));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">{t("periods.total")}: {periods.length}</span>
        <div className="flex flex-wrap items-center gap-2">
          <ResetFlowButton locale={locale} />
          <Link href="/admin/periods/new" className={buttonClass({ size: "sm" })}>
            {t("periods.addPeriod")}
          </Link>
        </div>
      </div>

      <ul className="space-y-3">
        {periods.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-surface p-5 shadow-sm"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-ink">{p.name}</span>
                <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
                  {periodStatusLabel(locale, p.status)}
                </Badge>
              </div>
              <div className="mt-1.5 text-sm leading-6 text-ink-muted" data-numeric>
                {t("periods.periodLabel")}: {fmt(p.startDate)} — {fmt(p.endDate)} · {t("periods.windowLabel")}: {fmt(p.windowStart)} —{" "}
                {fmt(p.windowEnd)} · {t("periods.limitLabel")}: {p.maxSelections} · {t("periods.applicationsLabel")}: {p._count.applications}
              </div>
              <div className="mt-1 text-xs text-ink-subtle" data-numeric>
                {t("periods.editedLabel")}: {formatLastEdit(lastEdits.get(p.id), p.updatedAt)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {p.status !== "CLOSED" && (
                <Link
                  href={`/admin/periods/${p.id}`}
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  {t("periods.edit")}
                </Link>
              )}
              <PeriodActions id={p.id} status={p.status} name={p.name} locale={locale} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
