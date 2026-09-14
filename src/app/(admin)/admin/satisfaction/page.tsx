import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getSatisfactionSettings } from "@/lib/satisfaction";
import { getLocale, getTranslator } from "@/lib/i18n";
import { Badge, Card, EmptyState, RowId, SectionTitle, Table, type BadgeTone } from "@/components/ui";
import { SatisfactionSettingsForm } from "./_settings-form";
import { SatisfactionPreviewButton } from "./_preview-button";

export const dynamic = "force-dynamic";

const RATING_TONE: Record<number, BadgeTone> = {
  1: "warning",
  2: "warning",
  3: "neutral",
  4: "success",
  5: "success",
};

const RESPONSES_LIMIT = 100;

export default async function SatisfactionPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "satisfaction.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const [settings, responses, total, byRating] = await Promise.all([
    getSatisfactionSettings(),
    db.satisfactionResponse.findMany({
      include: { employee: { select: { fullName: true, department: true } } },
      orderBy: { createdAt: "desc" },
      take: RESPONSES_LIMIT,
    }),
    db.satisfactionResponse.count(),
    db.satisfactionResponse.groupBy({ by: ["rating"], _count: { _all: true } }),
  ]);

  const ratingCounts = new Map(byRating.map((r) => [r.rating, r._count._all]));
  const sum = byRating.reduce((acc, r) => acc + r.rating * r._count._all, 0);
  const avg = total > 0 ? sum / total : null;

  return (
    <div data-wide className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{t("satisfactionAdmin.title")}</h1>
        <SatisfactionPreviewButton locale={locale} />
      </header>

      <SatisfactionSettingsForm enabled={settings.enabled} repeatDays={settings.repeatDays} locale={locale} />

      <section className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-surface p-5 shadow-sm sm:min-w-[160px]">
          <div className="font-display text-4xl font-bold text-ink" data-numeric>
            {avg != null ? avg.toFixed(1) : "—"}
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
            {t("satisfactionAdmin.avgLabel")} · {total}
          </div>
        </div>
        <div className="flex flex-col justify-center gap-1.5 rounded-xl border border-line bg-surface p-5 shadow-sm">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = ratingCounts.get(n) ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={n} className="flex items-center gap-2 text-sm">
                <span className="w-4 shrink-0 text-ink-muted" data-numeric>
                  {n}
                </span>
                <span className="text-warning" aria-hidden="true">
                  ★
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-xs text-ink-muted" data-numeric>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={total}>
          {t("satisfactionAdmin.responsesTitle")}
        </SectionTitle>
        {responses.length === 0 ? (
          <EmptyState>{t("satisfactionAdmin.empty")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("satisfactionAdmin.colId")}</th>
                  <th>{t("satisfactionAdmin.colEmployee")}</th>
                  <th>{t("satisfactionAdmin.colRating")}</th>
                  <th>{t("satisfactionAdmin.colComment")}</th>
                  <th>{t("satisfactionAdmin.colWhen")}</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <RowId id={r.id} seq={r.seq} />
                    </td>
                    <td className="text-ink">
                      {r.employee.fullName}
                      <span className="text-ink-subtle"> · {r.employee.department}</span>
                    </td>
                    <td>
                      <Badge tone={RATING_TONE[r.rating] ?? "neutral"}>{"★".repeat(r.rating)}</Badge>
                    </td>
                    <td className="max-w-[26rem] text-ink-muted">{r.comment || "—"}</td>
                    <td className="text-ink-muted" data-numeric>
                      {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
        {total > RESPONSES_LIMIT && (
          <p className="text-sm text-ink-muted">
            {t("satisfactionAdmin.shownPrefix")} {RESPONSES_LIMIT} {t("satisfactionAdmin.shownSuffix")} {total}.
          </p>
        )}
      </section>
    </div>
  );
}
