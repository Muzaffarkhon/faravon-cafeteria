import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PARTNER_STATUS_LABELS } from "@/lib/labels";
import { DeletePartnerButton } from "./_delete-button";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  SOON: "bg-amber-50 text-amber-700",
  ARCHIVED: "bg-neutral-100 text-neutral-500",
};

export default async function PartnersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "partners.manage")) redirect("/");

  const partners = await db.partner.findMany({
    include: { _count: { select: { cards: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Справочник партнёров ({partners.length})</h1>
        <Link
          href="/admin/partners/new"
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Добавить партнёра
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Название</th>
              <th className="px-4 py-2 font-medium">Категория</th>
              <th className="px-4 py-2 font-medium">Скидка</th>
              <th className="px-4 py-2 font-medium">Карточек</th>
              <th className="px-4 py-2 font-medium">Статус</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {partners.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2 text-neutral-500">{p.category ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-500">{p.discountType ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-500">{p._count.cards}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLE[p.status] ?? "bg-neutral-100"
                    }`}
                  >
                    {PARTNER_STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/partners/${p.id}`}
                      className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100"
                    >
                      Изменить
                    </Link>
                    <DeletePartnerButton id={p.id} name={p.name} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
