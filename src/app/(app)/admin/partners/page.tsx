import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PARTNER_STATUS_LABELS } from "@/lib/labels";
import { Badge, PageHeader, RowId, Table, buttonClass, type BadgeTone } from "@/components/ui";
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
    include: {
      _count: { select: { cards: true } },
      serviceUsers: {
        where: { roles: { has: "CONTRACTOR" } },
        select: { id: true, login: true, isActive: true },
      },
    },
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

      <div className="overflow-hidden rounded-[18px] bg-surface shadow-sm">
        <Table stickyHeader>
          <thead>
            <tr>
              <th>ID</th>
              <th>Название</th>
              <th>Учётка подрядчика</th>
              <th>Категория</th>
              <th>Скидка</th>
              <th>Карточек</th>
              <th>Статус</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id}>
                <td>
                  <RowId id={p.id} seq={p.seq} />
                </td>
                <td className="font-medium text-ink">{p.name}</td>
                <td>
                  {p.serviceUsers.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {p.serviceUsers.map((u) => (
                        <Badge key={u.id} tone={u.isActive ? "success" : "warning"}>
                          {u.login} {!u.isActive && "(откл.)"}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <Link
                      href={`/admin/partners/${p.id}`}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      + Создать
                    </Link>
                  )}
                </td>
                <td>{p.category ?? "—"}</td>
                <td>{p.discountType ?? "—"}</td>
                <td>{p._count.cards}</td>
                <td>
                  <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
                    {PARTNER_STATUS_LABELS[p.status]}
                  </Badge>
                </td>
                <td>
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
        </Table>
      </div>
    </div>
  );
}
