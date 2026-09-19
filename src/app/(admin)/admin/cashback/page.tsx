import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatSomoni } from "@/lib/cashback-math";
import { Badge, Card, EmptyState, Table } from "@/components/ui";
import { reverseOperationAction } from "./actions";

const money = (d: number) => `${formatSomoni(d)} сом.`;

export default async function AdminCashbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cashback.manage")) redirect("/");
  const sp = await searchParams;

  const [accounts, sums, recent] = await Promise.all([
    db.cashbackAccount.findMany({ include: { partner: { select: { name: true } }, employee: { select: { fullName: true } } } }),
    db.cashbackEntry.groupBy({ by: ["accountId", "kind"], _sum: { amount: true } }),
    db.cashbackEntry.findMany({
      where: { kind: { in: ["ACCRUAL", "REDEMPTION"] } },
      orderBy: { createdAt: "desc" },
      take: 400,
      include: { account: { select: { employee: { select: { fullName: true } }, partner: { select: { name: true } } } } },
    }),
  ]);

  // ── Сверка: баланс каждого счёта должен равняться сумме его журнала.
  const sumOf = new Map<string, Record<string, number>>();
  for (const r of sums) {
    const m = sumOf.get(r.accountId) ?? {};
    m[r.kind] = r._sum.amount ?? 0;
    sumOf.set(r.accountId, m);
  }
  const ledgerBalance = (id: string) => {
    const m = sumOf.get(id) ?? {};
    return (m.ACCRUAL ?? 0) - (m.REDEMPTION ?? 0) - (m.ACCRUAL_REVERSAL ?? 0) + (m.REDEMPTION_REVERSAL ?? 0);
  };
  const mismatches = accounts.filter((a) => ledgerBalance(a.id) !== a.balance);

  // ── Сводка по партнёрам.
  type Row = { name: string; accrued: number; redeemed: number; reversed: number; liability: number; accounts: number };
  const byPartner = new Map<string, Row>();
  for (const a of accounts) {
    const r = byPartner.get(a.partnerId) ?? { name: a.partner.name, accrued: 0, redeemed: 0, reversed: 0, liability: 0, accounts: 0 };
    const m = sumOf.get(a.id) ?? {};
    r.accrued += m.ACCRUAL ?? 0;
    r.redeemed += m.REDEMPTION ?? 0;
    r.reversed += (m.ACCRUAL_REVERSAL ?? 0) + (m.REDEMPTION_REVERSAL ?? 0);
    r.liability += a.balance;
    r.accounts += 1;
    byPartner.set(a.partnerId, r);
  }
  const partners = [...byPartner.values()].sort((x, y) => y.liability - x.liability);
  const totalLiability = partners.reduce((s, p) => s + p.liability, 0);

  // ── Журнал: операции (списание и начисление одной покупки — одна строка), с признаком сторно.
  const ids = recent.map((e) => e.id);
  const reversedIds = new Set(
    (await db.cashbackEntry.findMany({ where: { reversesEntryId: { in: ids } }, select: { reversesEntryId: true } })).map(
      (r) => r.reversesEntryId as string,
    ),
  );
  const actorIds = [...new Set(recent.map((e) => e.actorId).filter((x): x is string => !!x))];
  const actors = new Map(
    (await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, login: true } })).map((u) => [u.id, u.login]),
  );
  type Op = {
    key: string;
    at: Date;
    employee: string;
    partner: string;
    cashier: string;
    purchase: number;
    redeemed: number;
    accrued: number;
    reversed: boolean;
  };
  const ops = new Map<string, Op>();
  for (const e of recent) {
    const key = e.operationKey ?? e.id;
    const o: Op = ops.get(key) ?? {
      key,
      at: e.createdAt,
      employee: e.account.employee.fullName,
      partner: e.account.partner.name,
      cashier: (e.actorId && actors.get(e.actorId)) || "—",
      purchase: e.purchaseAmount,
      redeemed: 0,
      accrued: 0,
      reversed: false,
    };
    if (e.kind === "REDEMPTION") o.redeemed += e.amount;
    else o.accrued += e.amount;
    if (reversedIds.has(e.id)) o.reversed = true;
    ops.set(key, o);
  }
  const operations = [...ops.values()].slice(0, 100);

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Кешбек</h1>
        <p className="text-sm text-ink-muted">
          Обязательства по накопленному кешбеку, сверка баланса с журналом и сторно ошибочных операций. Журнал не
          редактируется: исправление делается записью-противовесом.
        </p>
      </header>

      {sp.ok && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          Сторно выполнено.
        </p>
      )}
      {sp.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {sp.error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Сверка баланса с журналом</h2>
        {mismatches.length === 0 ? (
          <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong">
            ✓ Расхождений нет: балансы всех счетов ({accounts.length}) совпадают с журналом операций.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
              ⚠ Найдены расхождения: {mismatches.length}. Баланс не совпадает с журналом: проверьте доступ к базе и
              историю изменений.
            </p>
            <Card className="overflow-hidden">
              <Table>
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th>Партнёр</th>
                    <th>Баланс в базе</th>
                    <th>По журналу</th>
                  </tr>
                </thead>
                <tbody>
                  {mismatches.map((a) => (
                    <tr key={a.id}>
                      <td>{a.employee.fullName}</td>
                      <td>{a.partner.name}</td>
                      <td data-numeric>{money(a.balance)}</td>
                      <td data-numeric>{money(ledgerBalance(a.id))}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">
          Обязательства по партнёрам{" "}
          <span className="text-sm font-normal text-ink-muted">· всего {money(totalLiability)}</span>
        </h2>
        {partners.length === 0 ? (
          <EmptyState>Операций по кешбеку пока не было.</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <th>Партнёр</th>
                  <th>Счетов</th>
                  <th>Начислено</th>
                  <th>Списано</th>
                  <th>Сторно</th>
                  <th>Остаток (обязательство)</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.name}>
                    <td className="text-ink">{p.name}</td>
                    <td data-numeric>{p.accounts}</td>
                    <td data-numeric>{money(p.accrued)}</td>
                    <td data-numeric>{money(p.redeemed)}</td>
                    <td data-numeric>{money(p.reversed)}</td>
                    <td className="font-semibold text-ink" data-numeric>
                      {money(p.liability)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Последние операции</h2>
        <p className="text-xs text-ink-subtle">
          Сторно проводит сотрудник C&amp;B, не тот, кто проводил операцию. Начисление нельзя отменить, если оно уже
          потрачено.
        </p>
        {operations.length === 0 ? (
          <EmptyState>Операций пока нет.</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Сотрудник</th>
                  <th>Партнёр</th>
                  <th>Кассир</th>
                  <th>Чек</th>
                  <th>Списано</th>
                  <th>Начислено</th>
                  <th>Сторно</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((o) => (
                  <tr key={o.key} className="align-top">
                    <td className="whitespace-nowrap text-ink-muted" data-numeric>
                      {o.at.toLocaleString("ru-RU", { timeZone: "Asia/Dushanbe" })}
                    </td>
                    <td className="text-ink">{o.employee}</td>
                    <td className="text-ink-muted">{o.partner}</td>
                    <td className="text-ink-muted">{o.cashier}</td>
                    <td data-numeric>{money(o.purchase)}</td>
                    <td data-numeric>{o.redeemed > 0 ? money(o.redeemed) : "—"}</td>
                    <td data-numeric>{o.accrued > 0 ? money(o.accrued) : "—"}</td>
                    <td>
                      {o.reversed ? (
                        <Badge tone="muted">сторнирована</Badge>
                      ) : (
                        <form action={reverseOperationAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="operationKey" value={o.key} />
                          <input
                            name="reason"
                            required
                            minLength={5}
                            maxLength={300}
                            placeholder="Причина"
                            aria-label="Причина сторно"
                            className="w-36 rounded-md border border-line-strong bg-surface px-2 py-1 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded-md border border-line-strong px-2 py-1 text-xs font-semibold text-ink hover:bg-surface-muted"
                          >
                            Сторно
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
