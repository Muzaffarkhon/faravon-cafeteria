import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PARTNER_STATUS_LABELS } from "@/lib/labels";
import { Badge, Card, PageHeader, buttonClass, type BadgeTone } from "@/components/ui";
import { DeletePartnerButton } from "./_delete-button";

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  SOON: "warning",
  ARCHIVED: "neutral",
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
      <PageHeader
        title={`Справочник партнёров (${partners.length})`}
        action={
          <Link href="/admin/partners/new" className={buttonClass({ size: "sm" })}>
            Добавить партнёра
          </Link>
        }
      />

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line-subtle text-left text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Название</th>
              <th className="px-4 py-2 font-medium">Категория</th>
              <th className="px-4 py-2 font-medium">Скидка</th>
              <th className="px-4 py-2 font-medium">Карточек</th>
              <th className="px-4 py-2 font-medium">Статус</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {partners.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-surface-muted/60">
                <td className="px-4 py-2 font-medium text-ink">{p.name}<div className="font-mono text-[10px] font-normal text-ink-subtle">{p.id}</div></td>
                <td className="px-4 py-2 text-ink-muted">{p.category ?? "—"}</td>
                <td className="px-4 py-2 text-ink-muted">{p.discountType ?? "—"}</td>
                <td className="px-4 py-2 text-ink-muted">{p._count.cards}</td>
                <td className="px-4 py-2">
                  <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
                    {PARTNER_STATUS_LABELS[p.status]}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/partners/${p.id}`}
                      className={buttonClass({ variant: "secondary", size: "sm" })}
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
      </Card>
    </div>
  );
}
