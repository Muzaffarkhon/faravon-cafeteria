import Link from "next/link";
import { redirect } from "next/navigation";
import type { Block } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { BLOCKS, blockLabel, cardStatusLabel } from "@/lib/labels";
import { Badge, buttonClass } from "@/components/ui";
import { lastEditsFor, formatLastEdit } from "@/lib/last-edit";
import { getLocale, getTranslator } from "@/lib/i18n";
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
  const locale = await getLocale();
  const t = await getTranslator();

  const archiveView = (await searchParams).view === "archive";
  const [cards, archivedCount] = await Promise.all([
    db.benefitCard.findMany({
      where: { archivedAt: archiveView ? { not: null } : null },
      include: { partner: true, _count: { select: { items: true } } },
      orderBy: [{ block: "asc" }, { sortOrder: "asc" }],
    }),
    db.benefitCard.count({ where: { archivedAt: { not: null } } }),
  ]);
  const lastEdits = await lastEditsFor("BenefitCard", cards.map((c) => c.id));

  const byBlock = (b: Block) => cards.filter((c) => c.block === b);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">
          {archiveView ? `${t("cards.inArchive")}: ${cards.length}` : `${t("cards.total")}: ${cards.length}`}
        </span>
        <div className="flex items-center gap-2">
          <Link
            href={archiveView ? "/admin/cards" : "/admin/cards?view=archive"}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            {archiveView ? t("cards.toActive") : `${t("cards.archive")}${archivedCount ? ` (${archivedCount})` : ""}`}
          </Link>
          {!archiveView && (
            <Link href="/admin/cards/new" className={buttonClass({ size: "sm" })}>
              {t("cards.addCard")}
            </Link>
          )}
        </div>
      </div>

      {BLOCKS.map((b) => (
        <section key={b} className="space-y-3">
          <h2 className="px-1 text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">
            {blockLabel(locale, b)} <span className="font-normal">({byBlock(b).length})</span>
          </h2>
          {byBlock(b).length === 0 ? (
            <p className="px-1 text-sm text-ink-subtle">{t("cards.none")}</p>
          ) : (
            <ul className="space-y-3">
              {byBlock(b).map((c, i) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-surface p-4 shadow-sm"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="w-6 shrink-0 text-center font-mono text-xs font-semibold text-ink-subtle">
                      {i + 1}
                    </span>
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
                        {!c.isActive && <Badge tone="neutral">{t("cards.soon")}</Badge>}
                        {c.status === "DRAFT" && <Badge tone="warning">{cardStatusLabel(locale, "DRAFT")}</Badge>}
                      </div>
                      <div className="mt-0.5 text-sm text-ink-subtle">
                        {c.partner?.name ? `${c.partner.name} · ` : ""}
                        {c.condition ?? c.description ?? "—"}
                        {c._count.items > 0 && ` · ${t("cards.itemsCount")}: ${c._count.items}`}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-subtle" data-numeric>
                        {t("cards.editedLabel")}: {formatLastEdit(lastEdits.get(c.id), c.updatedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!archiveView && (
                      <Link
                        href={`/admin/cards/${c.id}`}
                        className={buttonClass({ variant: "secondary", size: "sm" })}
                      >
                        {t("cards.edit")}
                      </Link>
                    )}
                    <CardArchiveButton id={c.id} archived={!!c.archivedAt} locale={locale} />
                    {archiveView && <DeleteCardButton id={c.id} title={c.title} locale={locale} />}
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
