import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Card } from "@/components/ui";

export default async function GamificationPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          Скоро
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          Геймификация
        </h1>
      </header>

      <Card className="flex flex-col items-center gap-4 p-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M17 5h2a2 2 0 0 1 0 4h-2M7 5H5a2 2 0 0 0 0 4h2" />
          </svg>
        </span>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold text-ink">Раздел в разработке</p>
          <p className="mx-auto max-w-md text-sm leading-6 text-ink-muted">
            Здесь появятся баллы за активность, достижения, рейтинги подразделений
            и награды за выбор льгот. Следите за обновлениями.
          </p>
        </div>
      </Card>
    </div>
  );
}
