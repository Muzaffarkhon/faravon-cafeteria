import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { COUPON_STATUS_LABELS } from "@/lib/coupon";
import { listCouponRegistry, isCouponStatus } from "@/lib/coupon-registry";
import { PERIOD_STATUS_LABELS } from "@/lib/labels";
import { CreateCouponButton, IssueCouponButton } from "./_buttons";

const COUPON_STATUS_STYLE: Record<string, string> = {
  CREATED: "bg-violet-50 text-violet-700",
  ISSUED: "bg-green-100 text-green-800",
  USED: "bg-neutral-100 text-neutral-600",
  EXPIRED: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-neutral-100 text-neutral-400 line-through",
};

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "coupons.manage")) redirect("/");

  const sp = await searchParams;
  const periodId = sp.period || undefined;
  const status = sp.status && isCouponStatus(sp.status) ? sp.status : undefined;

  const [awaiting, coupons, periods] = await Promise.all([
    db.applicationItem.findMany({
      where: { status: "APPROVED", coupon: null },
      include: {
        card: { include: { partner: true } },
        application: { include: { employee: true, period: true } },
      },
      orderBy: { decidedAt: "asc" },
    }),
    listCouponRegistry({ periodId, status }),
    db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, status: true } }),
  ]);

  const exportQuery = new URLSearchParams();
  if (periodId) exportQuery.set("period", periodId);
  if (status) exportQuery.set("status", status);
  const exportHref = `/coupons/export${exportQuery.toString() ? `?${exportQuery}` : ""}`;

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Купоны</h1>

      {/* Одобренные позиции без купона */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-red-700">
          Ожидают формирования купона ({awaiting.length})
        </h2>
        {awaiting.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
            Нет одобренных позиций без купона.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {awaiting.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="text-sm font-medium">{item.card.title}</div>
                  <div className="text-xs text-neutral-400">
                    {item.application.employee.fullName} · {item.card.partner?.name ?? "—"} ·{" "}
                    {item.application.period.name}
                  </div>
                </div>
                <CreateCouponButton itemId={item.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Реестр купонов */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-red-700">Реестр купонов ({coupons.length})</h2>
          <div className="flex items-center gap-2">
            <form method="get" className="flex items-center gap-2">
              <select name="period" defaultValue={periodId ?? ""} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm">
                <option value="">Все периоды</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {PERIOD_STATUS_LABELS[p.status]}
                  </option>
                ))}
              </select>
              <select name="status" defaultValue={status ?? ""} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm">
                <option value="">Все статусы</option>
                {Object.entries(COUPON_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
                Показать
              </button>
            </form>
            <a
              href={exportHref}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Экспорт в XLSX
            </a>
          </div>
        </div>

        {coupons.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
            Купонов по заданным условиям нет.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-100 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Номер</th>
                  <th className="px-4 py-2 font-medium">Сотрудник</th>
                  <th className="px-4 py-2 font-medium">Льгота / партнёр</th>
                  <th className="px-4 py-2 font-medium">Период</th>
                  <th className="px-4 py-2 font-medium">Действует до</th>
                  <th className="px-4 py-2 font-medium">Статус</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 font-mono text-xs">{c.number}</td>
                    <td className="px-4 py-2">{c.employee.fullName}</td>
                    <td className="px-4 py-2">
                      {c.item.card.title}
                      <span className="text-neutral-400"> · {c.partner?.name ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2 text-neutral-500">{c.period.name}</td>
                    <td className="px-4 py-2 text-neutral-500">
                      {c.validUntil ? c.validUntil.toLocaleDateString("ru-RU") : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          COUPON_STATUS_STYLE[c.status] ?? "bg-neutral-100"
                        }`}
                      >
                        {COUPON_STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.status === "CREATED" && <IssueCouponButton couponId={c.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
