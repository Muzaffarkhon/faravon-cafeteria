import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { COUPON_STATUS_LABELS } from "@/lib/coupon";
import { listCouponRegistry, countCouponRegistry, isCouponStatus } from "@/lib/coupon-registry";
import { PERIOD_STATUS_LABELS } from "@/lib/labels";
import {
  Badge,
  EmptyState,
  RowId,
  SectionTitle,
  Select,
  Table,
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
  searchParams: Promise<{
    period?: string;
    status?: string;
    partner?: string;
    emp?: string;
    page?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "coupons.manage")) redirect("/");

  const sp = await searchParams;
  const periodId = sp.period || undefined;
  const status = sp.status && isCouponStatus(sp.status) ? sp.status : undefined;
  const partnerId = sp.partner || undefined;
  const emp = (sp.emp || "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const PAGE_SIZE = 50;
  const AWAITING_CAP = 200;

  const filters = { periodId, status, partnerId, employeeQuery: emp || undefined };
  const [awaiting, awaitingTotal, coupons, couponsTotal, periods, partners] = await Promise.all([
    db.applicationItem.findMany({
      where: { status: "APPROVED", coupon: null },
      include: {
        card: { include: { partner: true } },
        application: { include: { employee: true, period: true } },
      },
      orderBy: { decidedAt: "asc" },
      take: AWAITING_CAP,
    }),
    db.applicationItem.count({ where: { status: "APPROVED", coupon: null } }),
    listCouponRegistry({ ...filters, page, pageSize: PAGE_SIZE }),
    countCouponRegistry(filters),
    db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, status: true } }),
    db.partner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(couponsTotal / PAGE_SIZE));
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (periodId) p.set("period", periodId);
    if (status) p.set("status", status);
    if (partnerId) p.set("partner", partnerId);
    if (emp) p.set("emp", emp);
    if (n > 1) p.set("page", String(n));
    const str = p.toString();
    return str ? `/coupons?${str}` : "/coupons";
  };

  const exportQuery = new URLSearchParams();
  if (periodId) exportQuery.set("period", periodId);
  if (status) exportQuery.set("status", status);
  if (partnerId) exportQuery.set("partner", partnerId);
  if (emp) exportQuery.set("emp", emp);
  const exportHref = `/coupons/export${exportQuery.toString() ? `?${exportQuery}` : ""}`;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-[1.5625rem]">Купоны</h1>
      </header>

      {/* Одобренные позиции без купона */}
      <section className="space-y-3">
        <SectionTitle className="text-lg" count={awaitingTotal}>
          Ожидают формирования купона
        </SectionTitle>
        {awaitingTotal > awaiting.length && (
          <p className="text-sm text-ink-muted">
            Показаны первые {awaiting.length}. Сформируйте купоны, чтобы разобрать очередь.
          </p>
        )}
        {awaiting.length === 0 ? (
          <EmptyState>Нет одобренных позиций без купона.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {awaiting.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-surface p-5 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="text-[0.9375rem] font-bold text-ink">{item.card.title}</div>
                  <div className="mt-0.5 text-sm text-ink-subtle">
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
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle className="text-lg" count={couponsTotal}>Реестр купонов</SectionTitle>
          <form method="get" className="flex flex-wrap items-center gap-2">
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
            <Select name="partner" defaultValue={partnerId ?? ""} className="w-auto py-1.5 text-sm">
              <option value="">Все партнёры</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <input
              name="emp"
              defaultValue={emp}
              placeholder="ФИО сотрудника"
              className="w-40 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink shadow-xs outline-none"
            />
            <button className={buttonClass({ variant: "secondary", size: "sm" })}>Показать</button>
            <a href={exportHref} className={buttonClass({ size: "sm" })}>
              Экспорт в XLSX
            </a>
          </form>
        </div>

        {coupons.length === 0 ? (
          <EmptyState>Купонов по заданным условиям нет.</EmptyState>
        ) : (
          <div className="overflow-hidden rounded-[18px] bg-surface shadow-sm">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Сотрудник</th>
                  <th>Льгота / партнёр</th>
                  <th>Период</th>
                  <th>Действует до</th>
                  <th>Статус</th>
                  <th className="text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td data-numeric>
                      <div className="font-mono text-sm text-ink">{c.number}</div>
                      <RowId id={c.id} className="mt-0.5" />
                    </td>
                    <td className="text-ink">{c.employee.fullName}</td>
                    <td className="text-ink">
                      {c.item.card.title}
                      <span className="text-ink-subtle"> · {c.partner?.name ?? "—"}</span>
                    </td>
                    <td>{c.period.name}</td>
                    <td data-numeric>
                      {c.validUntil ? c.validUntil.toLocaleDateString("ru-RU") : "—"}
                    </td>
                    <td>
                      <Badge tone={COUPON_STATUS_TONE[c.status] ?? "neutral"}>
                        {COUPON_STATUS_LABELS[c.status]}
                      </Badge>
                    </td>
                    <td className="text-right">
                      {c.status === "CREATED" && <IssueCouponButton couponId={c.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">
              Стр. {page} из {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={pageHref(page - 1)}
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  Назад
                </a>
              )}
              {page < pages && (
                <a
                  href={pageHref(page + 1)}
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  Вперёд
                </a>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
