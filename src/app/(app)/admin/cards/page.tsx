import Link from "next/link";
import { redirect } from "next/navigation";
import type { Block } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { BLOCKS, BLOCK_LABELS, CARD_STATUS_LABELS } from "@/lib/labels";
import { Badge, PageHeader, buttonClass } from "@/components/ui";
import { DeleteCardButton } from "./_delete-button";
import { CardArchiveButton } from "./_archive-button";

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");

  const archiveView = (await searchParams).view === "archive";
  const [cards, archivedCount] = await Promise.all([
    db.benefitCard.findMany({
      where: { archivedAt: archiveView ? { not: null } : null },
      include: { partner: true, _count: { select: { items: true } } },
      orderBy: [{ block: "asc" }, { sortOrder: "asc" }],
    }),
    db.benefitCard.count({ where: { archivedAt: { not: null } } }),
  ]);

  const byBlock = (b: Block) => cards.filter((c) => c.block === b);

  return (
    <div className="space-y-6">
      <PageHeader
        title={archiveView ? `Архив карточек (${cards.length})` : `Карточки (${cards.length})`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href={archiveView ? "/admin/cards" : "/admin/cards?view=archive"}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              {archiveView ? "К активным" : `Архив${archivedCount ? ` (${archivedCount})` : ""}`}
            </Link>
            {!archiveView && (
              <Link href="/admin/cards/new" className={buttonClass({ size: "sm" })}>
                Добавить карточку
              </Link>
            )}
          </div>
        }
      />

      {BLOCKS.map((b) => (
        <section key={b} className="space-y-3">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            {BLOCK_LABELS[b]} <span className="font-normal">({byBlock(b).length})</span>
          </h2>
          {byBlock(b).length === 0 ? (
            <p className="px-1 text-sm text-ink-subtle">Нет карточек.</p>
          ) : (
            <ul className="space-y-3">
              {byBlock(b).map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-surface p-4 shadow-sm"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    {c.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-11 w-11 shrink-0 rounded-[12px] object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-bold text-ink">
                        {c.title}
                        {!c.isActive && <Badge tone="neutral">скоро</Badge>}
                        {c.status === "DRAFT" && <Badge tone="warning">{CARD_STATUS_LABELS.DRAFT}</Badge>}
                      </div>
                      <div className="mt-0.5 text-sm text-ink-subtle">
                        {c.partner?.name ? `${c.partner.name} · ` : ""}
                        {c.condition ?? c.description ?? "—"}
                        {c._count.items > 0 && ` · позиций: ${c._count.items}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!archiveView && (
                      <Link
                        href={`/admin/cards/${c.id}`}
                        className={buttonClass({ variant: "secondary", size: "sm" })}
                      >
                        Изменить
                      </Link>
                    )}
                    <CardArchiveButton id={c.id} archived={!!c.archivedAt} />
                    {archiveView && <DeleteCardButton id={c.id} title={c.title} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
