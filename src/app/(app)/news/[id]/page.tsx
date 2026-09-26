import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { FormattedText } from "@/components/formatted-text";

export default async function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.employee) redirect("/");
  const { id } = await params;

  const news = await db.news.findUnique({ where: { id } });
  if (!news || news.status !== "PUBLISHED") notFound();

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-2xl font-bold text-ink">{news.title}</h1>
      {news.publishedAt && (
        <p className="text-xs text-ink-subtle">{news.publishedAt.toLocaleDateString("ru-RU")}</p>
      )}
      {news.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={news.imageUrl} alt="" className="w-full rounded-2xl object-cover" />
      )}
      <div className="text-sm leading-7 text-ink">
        <FormattedText text={news.body} />
      </div>
    </div>
  );
}
