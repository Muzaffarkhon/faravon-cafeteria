import Link from "next/link";
import { redirect } from "next/navigation";
import type { Block } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { BLOCKS, BLOCK_LABELS, CARD_STATUS_LABELS } from "@/lib/labels";
import { Badge, Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { DeleteCardButton } from "./_delete-button";

export default async function CardsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");

  const cards = await db.benefitCard.findMany({
    include: { partner: true, _count: { select: { items: true } } },
    orderBy: [{ block: "asc" }, { sortOrder: "asc" }],
  });

  const byBlock = (b: Block) => cards.filter((c) => c.block === b);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Карточки (${cards.length})`}
        action={
          <Link href="/admin/cards/new" className={buttonClass({ size: "sm" })}>
            Добавить карточку
          </Link>
        }
      />

      {BLOCKS.map((b) => (
        <Card key={b}>
          <CardHeader className="text-sm font-semibold text-primary-strong">
            {BLOCK_LABELS[b]} <span className="font-normal text-ink-subtle">({byBlock(b).length})</span>
          </CardHeader>
          <ul className="divide-y divide-line-subtle">
            {byBlock(b).length === 0 && (
              <li className="px-5 py-3 text-sm text-ink-subtle">Нет карточек.</li>
            )}
            {byBlock(b).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {c.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.imageUrl}
                      alt=""
                      loading="lazy"
                      className="h-10 w-10 shrink-0 rounded-md border border-line object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-ink">
                      {c.title}
                      {!c.isActive && <Badge tone="neutral">скоро</Badge>}
                      {c.status === "DRAFT" && <Badge tone="warning">{CARD_STATUS_LABELS.DRAFT}</Badge>}
                    </div>
                    <div className="text-xs text-ink-subtle">
                      {c.partner?.name ? `${c.partner.name} · ` : ""}
                      {c.condition ?? c.description ?? "—"}
                      {c._count.items > 0 && ` · позиций: ${c._count.items}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/cards/${c.id}`}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    Изменить
                  </Link>
                  <DeleteCardButton id={c.id} title={c.title} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
