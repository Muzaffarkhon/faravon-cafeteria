"use client";

import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * Двухпанельная раскладка «как в обычном мессенджере»: список диалогов слева,
 * открытый диалог справа, обе панели скроллятся независимо друг от друга и
 * от страницы. На мобильном — одна панель за раз (список ИЛИ диалог),
 * определяем какая именно по адресу: на `/admin/support` (без выбранного
 * треда) — список, на `/admin/support/<id>` — диалог.
 *
 * Клиентский компонент — раньше `showSidebarOnMobile` приходил пропом от
 * серверной страницы, но с тех пор как список диалогов переехал в общий
 * layout (см. `(inbox)/layout.tsx`), панель — единственное место, которое
 * знает и про список, и про открытый диалог одновременно, так что решение
 * «что показать на мобильном» логичнее принимать прямо здесь, по адресу.
 */
export function SupportSplitShell({
  sidebar,
  content,
}: {
  sidebar: React.ReactNode;
  content: React.ReactNode;
}) {
  const pathname = usePathname();
  const showSidebarOnMobile = pathname === "/admin/support";

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[420px] overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-md sm:h-[calc(100dvh-6.5rem)]">
      {/* Список — свой (более тёмный) фон, отдельно от белого окна чата
          справа, иначе на светлой теме обе панели сливаются в одну страницу. */}
      <div
        className={cx(
          "w-full shrink-0 flex-col overflow-hidden border-r-2 border-line-strong bg-surface-muted sm:flex sm:w-[340px]",
          showSidebarOnMobile ? "flex" : "hidden",
        )}
      >
        {sidebar}
      </div>
      <div
        className={cx(
          "min-w-0 flex-1 flex-col overflow-hidden bg-surface",
          showSidebarOnMobile ? "hidden sm:flex" : "flex",
        )}
      >
        {content}
      </div>
    </div>
  );
}
