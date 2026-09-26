import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export default async function NewsFeedPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.employee) redirect("/");

  const news = await db.news.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true, body: true, imageUrl: true, publishedAt: true },
  });

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-2xl font-bold text-ink">Новости</h1>
      {news.length === 0 && <p className="text-sm text-ink-muted">Пока новостей нет.</p>}
      <div className="space-y-3">
        {news.map((n) => (
          <Link
            key={n.id}
            href={`/news/${n.id}`}
            className="block rounded-2xl border border-line-subtle bg-surface p-4 shadow-sm hover:border-line-strong"
          >
            {n.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.imageUrl} alt="" className="mb-3 h-36 w-full rounded-xl object-cover" />
            )}
            <h2 className="text-base font-bold text-ink">{n.title}</h2>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-muted">{n.body.replace(/[*_~#]/g, "")}</p>
            {n.publishedAt && (
              <p className="mt-2 text-xs text-ink-subtle">{n.publishedAt.toLocaleDateString("ru-RU")}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
