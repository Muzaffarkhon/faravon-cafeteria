import Link from "next/link";
import { cx } from "@/components/ui";

/** Подвкладки раздела: составить рассылку и история с ответами — раньше было на одной странице подряд. */
export function BroadcastSubnav({ active, historyCount }: { active: "new" | "history"; historyCount: number }) {
  const tabs = [
    { id: "new", href: "/admin/broadcast", label: "Новая рассылка" },
    { id: "history", href: "/admin/broadcast/history", label: "История и ответы", count: historyCount },
  ] as const;
  return (
    <nav aria-label="Рассылки" className="inline-flex gap-1 rounded-xl bg-surface-muted p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === active ? "page" : undefined}
          className={cx(
            "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
            tab.id === active ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
          )}
        >
          {tab.label}
          {"count" in tab && tab.count > 0 && <span className="text-xs font-normal text-ink-subtle tabular-nums">{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Ссылка «написать повторно» — открывает новую рассылку с уже выбранной аудиторией. */
export const followUpHref = (campaignId: string, answer: "YES" | "NO" | "NONE") =>
  `/admin/broadcast?segment=BY_CAMPAIGN&campaignId=${campaignId}&campaignAnswer=${answer}`;

/** Номер шага + заголовок карточки: «1 · Кому», «2 · Сообщение». */
export function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="border-b border-line-subtle px-5 py-3.5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-brand">
          {n}
        </span>
        <h2 className="font-bold text-ink">{title}</h2>
      </div>
      {hint && <p className="mt-1 pl-[2.125rem] text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/** Доли «Да / Нет / Не ответили» одной полосой — видно отклик рассылки без чтения цифр. */
export function AnswersBar({ yes, no, none, className }: { yes: number; no: number; none: number; className?: string }) {
  const total = yes + no + none;
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div
      className={cx("flex h-2 w-full overflow-hidden rounded-full bg-surface-muted", className)}
      role="img"
      aria-label={`Да ${yes}, Нет ${no}, не ответили ${none} из ${total}`}
    >
      <span className="bg-success" style={{ width: pct(yes) }} />
      <span className="bg-warning" style={{ width: pct(no) }} />
    </div>
  );
}
