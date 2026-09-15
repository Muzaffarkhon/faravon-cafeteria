"use client";

import { cx } from "@/components/ui";

/**
 * Двухпанельная раскладка «как в обычном мессенджере»: список диалогов слева,
 * открытый диалог справа, обе панели скроллятся независимо друг от друга и
 * от страницы. На мобильном — одна панель за раз (список ИЛИ диалог):
 * `showSidebarOnMobile` приходит пропом из `SupportInboxClient`, которая
 * знает, какой диалог сейчас открыт (`activeId`), без обращения к адресу —
 * переключение чатов идёт мимо роутера Next.js.
 */
export function SupportSplitShell({
  sidebar,
  content,
  showSidebarOnMobile,
}: {
  sidebar: React.ReactNode;
  content: React.ReactNode;
  showSidebarOnMobile: boolean;
}) {
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
