"use client";

import { useEffect, useRef } from "react";

const POLL_MS = 20_000;
const BLINK_MS = 1200;
const BLINK_TITLE = "🔴 Новое сообщение — Farovon";

/**
 * Звук + мигание заголовка вкладки при новом сообщении в чате поддержки.
 * Раньше это был Telegram-пуш на каждую реплику гостя — C&B заваливало
 * собственного бота уведомлениями о его же обращениях. Здесь тот же сигнал,
 * но только в интерфейсе: звук — всегда при росте счётчика, мигание — если
 * в этот момент вкладка не активна (свёрнута или открыта другая).
 *
 * Не переиспользует общий SSE (`LiveRefresh`) — тот намеренно закрывает
 * соединение на скрытой вкладке. Здесь ровно обратная задача, поэтому
 * отдельный лёгкий поллинг (см. `/api/support/unread-count`).
 */
export function SupportAlert() {
  const lastCount = useRef<number | null>(null);
  const blinkTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitle = useRef("");

  useEffect(() => {
    originalTitle.current = document.title;

    function stopBlink() {
      if (blinkTimer.current) {
        clearInterval(blinkTimer.current);
        blinkTimer.current = null;
      }
      document.title = originalTitle.current;
    }

    function startBlink() {
      if (blinkTimer.current) return;
      let on = false;
      blinkTimer.current = setInterval(() => {
        document.title = on ? originalTitle.current : BLINK_TITLE;
        on = !on;
      }, BLINK_MS);
    }

    function beep() {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
        osc.onended = () => void ctx.close();
      } catch {
        /* звук не критичен — молча пропускаем (заблокирован браузером и т.п.) */
      }
    }

    async function poll() {
      try {
        const r = await fetch("/api/support/unread-count", { cache: "no-store" });
        if (!r.ok) return;
        const { count } = (await r.json()) as { count: number };
        // null — первый опрос: запоминаем как базу, не сигналим о старых
        // непрочитанных, которые уже были на момент открытия страницы.
        if (lastCount.current !== null && count > lastCount.current) {
          beep();
          if (document.visibilityState === "hidden") startBlink();
        }
        lastCount.current = count;
      } catch {
        /* сеть подвела — подхватим на следующем опросе */
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") stopBlink();
    };

    void poll();
    const interval = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      stopBlink();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
