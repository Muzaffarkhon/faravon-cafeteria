"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Живое обновление разделов.
 *
 * Основной канал — SSE (`/api/stream`): сервер присылает `update`, когда
 * меняются релевантные пользователю данные (очередь согласования, купоны без
 * оформления, заявки на рекламу, собственные заявки/купоны, непрочитанные
 * уведомления). EventSource переподключается сам, поэтому короткоживущее
 * соединение (лимит времени функции на Vercel) не мешает.
 *
 * Подстраховка на случай, если SSE режет корпоративный прокси: обновление при
 * возврате фокуса и редкий таймер.
 */
const FALLBACK_MS = 90_000;

export function LiveRefresh({ sse = false }: { sse?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;

    const refresh = () => {
      if (!stopped && document.visibilityState === "visible") router.refresh();
    };

    const connect = () => {
      if (!sse || stopped || es || document.visibilityState !== "visible") return;
      try {
        es = new EventSource("/api/stream");
        es.addEventListener("update", refresh);
        es.onerror = () => {
          // На скрытой вкладке рвём соединение, чтобы не держать функцию;
          // иначе EventSource переподключится сам (retry задан сервером).
          if (document.visibilityState === "hidden") {
            es?.close();
            es = null;
          }
        };
      } catch {
        es = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        if (sse) connect();
      } else {
        es?.close();
        es = null;
      }
    };

    if (sse) connect();
    // Для обычных сотрудников обновляем только при возврате на вкладку/окно (focus/visibility).
    // Редкий таймер-подстраховка раз в 3 минуты на случай открытой неподвижной вкладки.
    const fallback = setInterval(refresh, sse ? FALLBACK_MS : 180_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      es?.close();
      es = null;
      clearInterval(fallback);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, sse]);

  return null;
}
