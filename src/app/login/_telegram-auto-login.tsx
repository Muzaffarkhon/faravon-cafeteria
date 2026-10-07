"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface TgWebApp {
  initData?: string;
}

/**
 * Если страница /login открыта внутри Telegram Mini App, пробуем войти по
 * подписанным Telegram данным (initData) — без пароля/OTP. Работает только
 * для сотрудников, уже привязавших Telegram через бота; иначе просто
 * показывается обычная форма входа.
 */
function TelegramAutoLoginInner() {
  const params = useSearchParams();

  useEffect(() => {
    let stopped = false;
    let tries = 0;

    const attempt = (initData: string) => {
      const next = /^\/(?!\/)[^\s\\]*$/.test(params.get("next") ?? "") ? (params.get("next") as string) : "/";
      fetch("/api/telegram/webapp-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      })
        .then((r) => r.json())
        .then((data: { ok?: boolean }) => {
          if (data.ok) window.location.href = next;
        })
        .catch(() => {});
    };

    const tryInit = () => {
      if (stopped) return;
      const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
      if (tg?.initData) attempt(tg.initData);
      else if (tries++ < 6) setTimeout(tryInit, 300); // ждём telegram-web-app.js
    };

    tryInit();
    return () => {
      stopped = true;
    };
  }, [params]);

  return null;
}

export function TelegramAutoLogin() {
  return (
    <Suspense fallback={null}>
      <TelegramAutoLoginInner />
    </Suspense>
  );
}
