"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Near-real-time: периодически и при возврате фокуса обновляет серверные
 * компоненты (router.refresh) — счётчики в меню и списки подтягивают свежие
 * данные без ручной перезагрузки. На скрытой вкладке не опрашивает.
 *
 * Push (SSE/WebSocket) на Vercel Hobby нежизнеспособен (лимит времени функции);
 * это компромисс без внешней инфраструктуры.
 */
const INTERVAL_MS = 25_000;

export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const start = () => {
      stop();
      timer = setInterval(tick, INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    start();
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
