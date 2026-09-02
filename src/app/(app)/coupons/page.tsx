import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { COUPON_STATUS_LABELS } from "@/lib/coupon";
import { listCouponRegistry, isCouponStatus } from "@/lib/coupon-registry";
import { PERIOD_STATUS_LABELS } from "@/lib/labels";
import {
  Badge,
  Card,
  EmptyState,
  SectionTitle,
  Select,
  buttonClass,
  type BadgeTone,
} from "@/components/ui";
import { CreateCouponButton, IssueCouponButton } from "./_buttons";

const COUPON_STATUS_TONE: Record<string, BadgeTone> = {
  CREATED: "accent",
  ISSUED: "success",
  USED: "neutral",
  EXPIRED: "warning",
  CANCELLED: "muted",
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
    <div className="space-y-10">
      <header className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          HR
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">Купоны</h1>
      </header>

      {/* Одобренные позиции без купона */}
      <section className="space-y-3">
        <SectionTitle className="text-lg" count={awaiting.length}>
          Ожидают формирования купона
        </SectionTitle>
        {awaiting.length === 0 ? (
          <EmptyState>Нет одобренных позиций без купона.</EmptyState>
        ) : (
          <Card>
            <ul className="divide-y divide-line-subtle">
              {awaiting.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="text-[0.9375rem] font-semibold text-ink">{item.card.title}</div>
                    <div className="mt-0.5 text-sm text-ink-subtle">
                      {item.application.employee.fullName} · {item.card.partner?.name ?? "—"} ·{" "}
                      {item.application.period.name}
                    </div>
                  </div>
                  <CreateCouponButton itemId={item.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Реестр купонов */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle className="text-lg" count={coupons.length}>Реестр купонов</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" className="flex items-center gap-2">
              <Select name="period" defaultValue={periodId ?? ""} className="w-auto py-1.5 text-sm">
                <option value="">Все периоды</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {PERIOD_STATUS_LABELS[p.status]}
                  </option>
                ))}
              </Select>
              <Select name="status" defaultValue={status ?? ""} className="w-auto py-1.5 text-sm">
                <option value="">Все статусы</option>
                {Object.entries(COUPON_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <button className={buttonClass({ variant: "secondary", size: "sm" })}>Показать</button>
            </form>
            <a href={exportHref} className={buttonClass({ size: "sm" })}>
              Экспорт в XLSX
            </a>
          </div>
        </div>

        {coupons.length === 0 ? (
          <EmptyState>Купонов по заданным условиям нет.</EmptyState>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line-subtle text-left text-xs text-ink-muted">
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
              <tbody className="divide-y divide-line-subtle">
                {coupons.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-surface-muted/60">
                    <td className="px-4 py-2.5 font-mono text-sm" data-numeric>{c.number}</td>
                    <td className="px-4 py-2.5 text-ink">{c.employee.fullName}</td>
                    <td className="px-4 py-2.5 text-ink">
                      {c.item.card.title}
                      <span className="text-ink-subtle"> · {c.partner?.name ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{c.period.name}</td>
                    <td className="px-4 py-2.5 text-ink-muted" data-numeric>
                      {c.validUntil ? c.validUntil.toLocaleDateString("ru-RU") : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={COUPON_STATUS_TONE[c.status] ?? "neutral"}>
                        {COUPON_STATUS_LABELS[c.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.status === "CREATED" && <IssueCouponButton couponId={c.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
