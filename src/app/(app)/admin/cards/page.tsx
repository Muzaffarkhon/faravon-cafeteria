import Link from "next/link";
import { redirect } from "next/navigation";
import type { Block } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { BLOCKS, BLOCK_LABELS, CARD_STATUS_LABELS } from "@/lib/labels";
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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Карточки ({cards.length})</h1>
        <Link
          href="/admin/cards/new"
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Добавить карточку
        </Link>
      </div>

      {BLOCKS.map((b) => (
        <section key={b} className="rounded-xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-5 py-3 text-sm font-semibold text-red-700">
            {BLOCK_LABELS[b]} ({byBlock(b).length})
          </div>
          <ul className="divide-y divide-neutral-100">
            {byBlock(b).length === 0 && (
              <li className="px-5 py-3 text-sm text-neutral-400">Нет карточек.</li>
            )}
            {byBlock(b).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {c.title}
                    {!c.isActive && (
                      <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600">
                        скоро
                      </span>
                    )}
                    {c.status === "DRAFT" && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                        {CARD_STATUS_LABELS.DRAFT}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {c.partner?.name ? `${c.partner.name} · ` : ""}
                    {c.condition ?? c.description ?? "—"}
                    {c._count.items > 0 && ` · позиций: ${c._count.items}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/cards/${c.id}`}
                    className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100"
                  >
                    Изменить
                  </Link>
                  <DeleteCardButton id={c.id} title={c.title} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
