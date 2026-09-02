"use client";

import { useEffect } from "react";

type Inset = { top?: number; bottom?: number; left?: number; right?: number };

interface TgWebApp {
  ready?: () => void;
  expand?: () => void;
  initData?: string;
  platform?: string;
  safeAreaInset?: Inset;
  contentSafeAreaInset?: Inset;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
}

const EVENTS = ["safeAreaChanged", "contentSafeAreaChanged", "viewportChanged"];

/**
 * Внутри Telegram Mini App поверх верхней части WebView Telegram рисует свои
 * кнопки («Закрыть», меню). Считываем отступы Telegram в CSS-переменную
 * --tg-top, чтобы шапка приложения не пряталась под ними. Вне Telegram
 * переменная остаётся 0 — на обычном сайте ничего не меняется.
 *
 * ВАЖНО: telegram-web-app.js создаёт window.Telegram.WebApp и в обычном
 * браузере тоже — поэтому сначала проверяем, что запуск действительно из
 * Telegram (initData / platform), иначе резерв в 64px давал пустую полосу.
 */
export function TelegramChrome() {
  useEffect(() => {
    let stopped = false;
    let detach: (() => void) | undefined;

    const isTelegram = (tg: TgWebApp) =>
      (typeof tg.initData === "string" && tg.initData.length > 0) ||
      (!!tg.platform && tg.platform !== "unknown");

    const setup = (tg: TgWebApp) => {
      if (!isTelegram(tg)) return; // обычный браузер — ничего не трогаем
      tg.ready?.();
      tg.expand?.();

      const apply = () => {
        const top =
          (tg.safeAreaInset?.top ?? 0) + (tg.contentSafeAreaInset?.top ?? 0);
        // Старый клиент не отдаёт отступы — резервируем место под кнопки.
        const px = top > 0 ? Math.round(top) : 64;
        document.documentElement.style.setProperty("--tg-top", `${px}px`);
      };

      apply();
      EVENTS.forEach((e) => tg.onEvent?.(e, apply));
      detach = () => EVENTS.forEach((e) => tg.offEvent?.(e, apply));
    };

    let tries = 0;
    const tryInit = () => {
      if (stopped) return;
      const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram
        ?.WebApp;
      if (tg) setup(tg);
      else if (tries++ < 4) setTimeout(tryInit, 400); // ждём telegram-web-app.js
    };

    tryInit();
    return () => {
      stopped = true;
      detach?.();
    };
  }, []);

  return null;
}
