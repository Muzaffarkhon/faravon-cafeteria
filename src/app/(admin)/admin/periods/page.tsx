import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { periodStatusLabel } from "@/lib/labels";
import { Badge, Card, Table, buttonClass, type BadgeTone } from "@/components/ui";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
import { PeriodActions, ResetFlowButton } from "./_status-buttons";
import { isSandbox } from "@/lib/app-env";
import { fmtDate } from "@/lib/dushanbe-date";

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  OPEN: "success",
  CLOSED: "neutral",
};

const fmt = (d: Date) => fmtDate(d);

export default async function PeriodsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "periods.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();
  const sandbox = isSandbox();

  const periods = await db.period.findMany({
    include: { _count: { select: { applications: true } } },
    orderBy: { startDate: "desc" },
  });
  const lastEdits = await lastEditsFor("Period", periods.map((p) => p.id));

  return (
    <div data-wide className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">{t("periods.total")}: {periods.length}</span>
        <Link href="/admin/periods/new" className={buttonClass({ size: "sm" })}>
          {t("periods.addPeriod")}
        </Link>
      </div>

      <Card className="overflow-hidden">
        <Table stickyHeader>
          <thead>
            <tr>
              <th>{t("periods.form.name")}</th>
              <th>{t("users.colStatus")}</th>
              <th>{t("periods.periodLabel")}</th>
              <th>{t("periods.windowLabel")}</th>
              <th className="text-center">{t("periods.limitLabel")}</th>
              <th className="text-center">{t("periods.form.maxCoinRedemptions")}</th>
              <th className="text-center">{t("periods.applicationsLabel")}</th>
              <th>{t("periods.editedLabel")}</th>
              <th className="text-right">{t("users.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {periods.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-ink-muted">
                  {t("reports.noData")}
                </td>
              </tr>
            ) : (
              periods.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap font-semibold text-ink">{p.name}</td>
                  <td>
                    <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
                      {periodStatusLabel(locale, p.status)}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap text-ink-muted" data-numeric>
                    {fmt(p.startDate)} — {fmt(p.endDate)}
                  </td>
                  <td className="whitespace-nowrap text-ink-muted" data-numeric>
                    {fmt(p.windowStart)} — {fmt(p.windowEnd)}
                  </td>
                  <td className="text-center font-medium text-ink" data-numeric>
                    {p.maxSelections}
                  </td>
                  <td className="text-center font-medium text-ink" data-numeric>
                    {p.maxCoinRedemptions}
                  </td>
                  <td className="text-center font-medium text-ink" data-numeric>
                    {p._count.applications}
                  </td>
                  <td className="whitespace-nowrap text-xs text-ink-subtle" data-numeric>
                    {formatLastEdit(lastEdits.get(p.id), p.updatedAt)}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      {p.status !== "CLOSED" && (
                        <Link
                          href={`/admin/periods/${p.id}`}
                          className={buttonClass({ variant: "secondary", size: "sm" })}
                        >
                          {t("periods.edit")}
                        </Link>
                      )}
                      {sandbox && (
                        <ResetFlowButton periodId={p.id} name={p.name} locale={locale} />
                      )}
                      <PeriodActions id={p.id} status={p.status} name={p.name} locale={locale} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
