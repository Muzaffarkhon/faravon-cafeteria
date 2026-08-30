import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERIOD_STATUS_LABELS } from "@/lib/labels";
import { PeriodActions } from "./_status-buttons";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  OPEN: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-neutral-100 text-neutral-500",
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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Периоды выбора ({periods.length})</h1>
        <Link
          href="/admin/periods/new"
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Добавить период
        </Link>
      </div>

      <ul className="space-y-3">
        {periods.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{p.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLE[p.status] ?? "bg-neutral-100"
                  }`}
                >
                  {PERIOD_STATUS_LABELS[p.status]}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Период: {fmt(p.startDate)} — {fmt(p.endDate)} · Окно выбора: {fmt(p.windowStart)} —{" "}
                {fmt(p.windowEnd)} · Лимит: {p.maxSelections} · Заявок: {p._count.applications}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {p.status !== "CLOSED" && (
                <Link
                  href={`/admin/periods/${p.id}`}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100"
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
