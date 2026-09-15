"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { SupportSplitShell } from "../_split-shell";
import { ThreadListLive } from "../_thread-list-live";
import { ThreadViewLive } from "./_thread-view-live";

/**
 * Владеет тем, какой диалог сейчас открыт, и отдаёт его обеим панелям
 * пропом. Раньше диалог выбирался обычной `<Link>`/`router.push` на
 * `/admin/support/<id>` (или через `history.pushState` в обход роутера —
 * тоже не помогло): Next.js перехватывает ЛЮБОЕ изменение пути (даже через
 * сырой `pushState` — он патчит этот метод глобально) и заново запрашивает
 * RSC для общего `layout.tsx` (он асинхронный — проверяет сессию), из-за
 * чего на медленной сети вся раскладка на миг перемонтировалась и список
 * пустел — заметная «перезагрузка страницы» при переключении чатов.
 *
 * Next.js не трогает ХЭШ адреса — его роутер следит только за путём и
 * query-параметрами. Поэтому выбранный диалог живёт в хэше
 * (`/admin/support#<id>`) и обычном состоянии React: клик меняет только
 * хэш (не путь), RSC-навигация вообще не запускается, раскладка не
 * шевелится. Хэш всё равно даёт рабочую ссылку на диалог — при первой
 * загрузке страницы читаем его и открываем нужный чат.
 */
export function SupportInboxClient({ locale }: { locale: Locale }) {
  const searchParams = useSearchParams();
  // Сервер не видит хэш (браузер его не отправляет), поэтому первый рендер
  // всегда без выбранного диалога — иначе гидратация не совпадёт с тем, что
  // отрисовал сервер. Хэш подхватываем эффектом сразу после монтирования.
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  useEffect(() => {
    function syncFromHash() {
      setActiveId(window.location.hash.slice(1) || undefined);
    }
    syncFromHash();
    // Кнопки «назад»/«вперёд» в браузере меняют хэш нативно — подхватываем и это.
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const openThread = useCallback((id: string) => {
    setActiveId(id);
    window.history.pushState(null, "", `#${id}`);
  }, []);

  const closeThread = useCallback(() => {
    setActiveId(undefined);
    window.history.pushState(null, "", window.location.pathname + window.location.search);
  }, []);

  const qs = searchParams.toString();
  const backHref = `/admin/support${qs ? `?${qs}` : ""}`;

  return (
    <SupportSplitShell
      showSidebarOnMobile={!activeId}
      sidebar={<ThreadListLive locale={locale} activeId={activeId} onSelect={openThread} />}
      content={<ThreadViewLive locale={locale} activeId={activeId} backHref={backHref} onBack={closeThread} />}
    />
  );
}
