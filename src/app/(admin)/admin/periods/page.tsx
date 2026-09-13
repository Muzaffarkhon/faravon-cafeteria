import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERIOD_STATUS_LABELS } from "@/lib/labels";
import { Badge, buttonClass, type BadgeTone } from "@/components/ui";
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

  const periods = await db.period.findMany({
    include: { _count: { select: { applications: true } } },
    orderBy: { startDate: "desc" },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">Всего: {periods.length}</span>
        <div className="flex flex-wrap items-center gap-2">
          <ResetFlowButton />
          <Link href="/admin/periods/new" className={buttonClass({ size: "sm" })}>
            Добавить период
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
                  {PERIOD_STATUS_LABELS[p.status]}
                </Badge>
              </div>
              <div className="mt-1.5 text-sm leading-6 text-ink-muted" data-numeric>
                Период: {fmt(p.startDate)} — {fmt(p.endDate)} · Окно выбора: {fmt(p.windowStart)} —{" "}
                {fmt(p.windowEnd)} · Лимит: {p.maxSelections} · Заявок: {p._count.applications}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {p.status !== "CLOSED" && (
                <Link
                  href={`/admin/periods/${p.id}`}
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  Изменить
                </Link>
              )}
              <PeriodActions id={p.id} status={p.status} name={p.name} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
