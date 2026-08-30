import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ReviewRow } from "./_row";

export default async function ReviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "applications.decide")) redirect("/");

  const pending = await db.applicationItem.findMany({
    where: { status: "PENDING" },
    include: {
      card: { include: { partner: true } },
      application: { include: { employee: true, period: true } },
    },
    orderBy: [{ submittedAt: "asc" }],
  });

  // группировка по сотруднику + период
  const groups = new Map<
    string,
    { employee: string; department: string; period: string; items: typeof pending }
  >();
  for (const item of pending) {
    const key = `${item.application.employeeId}:${item.application.periodId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        employee: item.application.employee.fullName,
        department: item.application.employee.department,
        period: item.application.period.name,
        items: [],
      });
    }
    groups.get(key)!.items.push(item);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Согласование заявок</h1>
        <p className="text-sm text-neutral-500">
          Позиций на рассмотрении: {pending.length}
        </p>
      </div>

      {groups.size === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Нет позиций, ожидающих решения.
        </div>
      )}

      {[...groups.values()].map((g, i) => (
        <section key={i} className="rounded-xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-5 py-3">
            <div className="text-sm font-medium">{g.employee}</div>
            <div className="text-xs text-neutral-400">
              {g.department} · период: {g.period}
            </div>
          </div>
          <ul className="divide-y divide-neutral-100">
            {g.items.map((item) => (
              <ReviewRow
                key={item.id}
                itemId={item.id}
                card={item.card.title}
                partner={item.card.partner?.name ?? null}
                condition={item.card.condition}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
