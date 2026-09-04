import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function GamificationPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-[1.5625rem]">
          Геймификация
        </h1>
        <span className="rounded-full bg-primary-soft px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-primary-strong">
          Скоро
        </span>
      </header>

      <div className="flex flex-col items-center gap-4 rounded-[20px] bg-surface p-10 text-center shadow-sm">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M17 5h2a2 2 0 0 1 0 4h-2M7 5H5a2 2 0 0 0 0 4h2" />
          </svg>
        </span>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold text-ink">Раздел в разработке</p>
          <p className="mx-auto max-w-md text-sm leading-6 text-ink-muted">
            Здесь появятся баллы за выполнение задач и активность, достижения,
            рейтинги подразделений и льготы, которые можно получить за
            накопленные баллы. Следите за обновлениями.
          </p>
        </div>
      </div>
    </div>
  );
}
