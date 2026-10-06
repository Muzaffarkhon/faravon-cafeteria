"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 8_000;
const BLINK_MS = 1200;
const BLINK_TITLE = "🔴 Новое сообщение — Farovon";

/** Диалог открыт и прочитан — пересчитать непрочитанные сразу, не ждать опроса (см. _thread-view-live.tsx). */
export const SUPPORT_READ_EVENT = "support:read";

/** Рисует поверх обычной иконки красный кружок с белой обводкой — версия
 * favicon для мигания, тем же приёмом, что и бейдж-счётчик в интерфейсе. */
function buildAlertFavicon(baseHref: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = img.naturalWidth || 192;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const r = size * 0.24;
        const cx = size - r * 0.95;
        const cy = r * 0.95;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = "#DC2626";
        ctx.fill();
        ctx.lineWidth = size * 0.05;
        ctx.strokeStyle = "#FFFFFF";
        ctx.stroke();
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null); // canvas недоступен (приватный режим и т.п.) — просто без мигающей иконки
      }
    };
    img.onerror = () => resolve(null);
    img.src = baseHref;
  });
}

/**
 * Звук + мигание вкладки (заголовок и иконка) при новом сообщении в чате
 * поддержки. Раньше это был Telegram-пуш на каждую реплику гостя — C&B
 * заваливало собственного бота уведомлениями о его же обращениях. Здесь тот
 * же сигнал, но только в интерфейсе: звук — всегда при росте счётчика,
 * мигание — если в этот момент страница не в фокусе (свёрнута, открыта
 * другая вкладка ИЛИ пользователь ушёл в другое приложение —
 * `document.hasFocus()` ловит и то, и другое, а одной `visibilitychange`
 * для переключения приложений не всегда достаточно).
 *
 * Не переиспользует общий SSE (`LiveRefresh`) — тот намеренно закрывает
 * соединение на скрытой вкладке. Здесь ровно обратная задача, поэтому
 * отдельный лёгкий поллинг (см. `/api/support/unread-count`).
 */
export function SupportAlert() {
  const router = useRouter();
  const lastCount = useRef<number | null>(null);
  const blinkTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitle = useRef("");
  const audioCtx = useRef<AudioContext | null>(null);
  const faviconEl = useRef<HTMLLinkElement | null>(null);
  const originalFaviconHref = useRef("");
  const alertFaviconHref = useRef<string | null>(null);

  useEffect(() => {
    originalTitle.current = document.title;

    faviconEl.current = document.querySelector('link[rel="icon"]');
    if (faviconEl.current) {
      originalFaviconHref.current = faviconEl.current.href;
      void buildAlertFavicon(faviconEl.current.href).then((url) => {
        alertFaviconHref.current = url;
      });
    }

    function unlockAudio() {
      if (audioCtx.current) return;
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx.current = new Ctx();
      } catch {
      }
    }
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    function stopBlink() {
      if (blinkTimer.current) {
        clearInterval(blinkTimer.current);
        blinkTimer.current = null;
      }
      document.title = originalTitle.current;
      if (faviconEl.current) faviconEl.current.href = originalFaviconHref.current;
    }

    function startBlink() {
      if (blinkTimer.current) return;
      let on = false;
      blinkTimer.current = setInterval(() => {
        document.title = on ? originalTitle.current : BLINK_TITLE;
        if (faviconEl.current) {
          faviconEl.current.href = on
            ? originalFaviconHref.current
            : (alertFaviconHref.current ?? originalFaviconHref.current);
        }
        on = !on;
      }, BLINK_MS);
    }

    function beep() {
      const ctx = audioCtx.current;
      if (!ctx) return; // жеста ещё не было — тихо пропускаем, не ошибка
      try {
        if (ctx.state === "suspended") void ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      } catch {
      }
    }

    async function poll() {
      try {
        const r = await fetch("/api/support/unread-count", { cache: "no-store" });
        if (!r.ok) return;
        const { count } = (await r.json()) as { count: number };
        if (lastCount.current !== null && count > lastCount.current) {
          beep();
          if (!document.hasFocus() || document.visibilityState === "hidden") startBlink();
        }
        if (lastCount.current !== null && count !== lastCount.current) router.refresh();
        lastCount.current = count;
      } catch {
      }
    }

    const onFocus = () => {
      if (document.hasFocus()) stopBlink();
    };

    void poll();
    const interval = setInterval(poll, POLL_MS);
    const onRead = () => void poll();
    window.addEventListener(SUPPORT_READ_EVENT, onRead);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener(SUPPORT_READ_EVENT, onRead);
      stopBlink();
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return null;
}
