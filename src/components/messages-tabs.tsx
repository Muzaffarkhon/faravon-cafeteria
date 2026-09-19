import Link from "next/link";
import { getTranslator } from "@/lib/i18n";
import { cx } from "./ui";

export type MessagesTab = "broadcast" | "notifications" | "texts";

/** Вкладки раздела «Сообщения»: рассылки, шаблоны уведомлений бота и текстовые блоки сайта. */
export async function MessagesTabs({ active }: { active: MessagesTab }) {
  const t = await getTranslator();
  const tabs: { id: MessagesTab; href: string; label: string }[] = [
    { id: "broadcast", href: "/admin/broadcast", label: t("nav.broadcast") },
    { id: "notifications", href: "/admin/notifications", label: t("nav.notifications") },
    { id: "texts", href: "/admin/texts", label: t("nav.texts") },
  ];
  return (
    <nav aria-label={t("nav.messages")} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === active ? "page" : undefined}
          className={cx(
            "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            tab.id === active
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
