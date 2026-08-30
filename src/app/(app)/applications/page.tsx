import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ITEM_STATUS_LABELS } from "@/lib/application-workflow";
import { CancelItemButton } from "./_cancel-button";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  PENDING: "bg-blue-50 text-blue-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  COUPON_CREATED: "bg-violet-50 text-violet-700",
  COUPON_ISSUED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-50 text-red-700",
  CANCELLED: "bg-neutral-100 text-neutral-400 line-through",
};

export default async function ApplicationsPage() {
  const session = await getSession();
  if (!session?.employee) redirect("/");

  const applications = await db.application.findMany({
    where: { employeeId: session.employee.id },
    include: {
      period: true,
      items: {
        include: { card: { include: { partner: true } }, coupon: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (applications.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
        В этом периоде вы ещё не выбрали льготы.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Мои заявки и купоны</h1>

      {applications.map((app) => (
        <section key={app.id} className="rounded-xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-5 py-3 text-sm font-medium">
            Период: {app.period.name}
          </div>
          <ul className="divide-y divide-neutral-100">
            {app.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.card.title}</div>
                  <div className="text-xs text-neutral-400">
                    {item.card.partner?.name ?? "—"}
                    {item.submittedAt &&
                      ` · подано ${item.submittedAt.toLocaleDateString("ru-RU")}`}
                  </div>
                  {item.status === "REJECTED" && item.decisionComment && (
                    <div className="mt-1 text-xs text-red-600">
                      Причина: {item.decisionComment}
                    </div>
                  )}
                  {item.coupon && (
                    <div className="mt-1 text-xs text-green-700">
                      Купон № {item.coupon.number}
                      {item.coupon.validUntil &&
                        ` · действует до ${item.coupon.validUntil.toLocaleDateString("ru-RU")}`}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_STYLE[item.status] ?? "bg-neutral-100"
                    }`}
                  >
                    {ITEM_STATUS_LABELS[item.status]}
                  </span>
                  {(item.status === "DRAFT" || item.status === "PENDING") && (
                    <CancelItemButton itemId={item.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
