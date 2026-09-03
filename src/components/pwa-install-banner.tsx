"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function checkIsEligible(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const dismissedAt = localStorage.getItem("faravon_pwa_dismissed");
    if (dismissedAt) {
      const diffDays = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (diffDays < 7) return false;
    }
  } catch {}

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  const isTelegram = Boolean(
    (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData
  );

  return !isStandalone && !isTelegram;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosPromptVisible, setIsIosPromptVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Безусловная регистрация Service Worker (критично для PWA на ПК Chrome / Edge)
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Перехватываем событие beforeinstallprompt (Android / Chrome на ПК)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    if (!checkIsEligible()) {
      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      };
    }

    // Определение iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios|android/.test(userAgent);

    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIosDevice && isSafari) {
      iosTimer = setTimeout(() => {
        setIsIosPromptVisible(true);
      }, 1500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    setDeferredPrompt(null);
    setIsIosPromptVisible(false);
    try {
      localStorage.setItem("faravon_pwa_dismissed", Date.now().toString());
    } catch {}
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsDismissed(true);
      }
    } catch {}
  };

  if (isDismissed) return null;

  // Баннер для Android / Desktop Chrome
  if (deferredPrompt) {
    return (
      <aside
        role="dialog"
        aria-label="Установка приложения на экран"
        className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3.5 shadow-2xl backdrop-blur-md">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] shadow-sm">
            <Image
              src="/icons/icon-192.png"
              alt="Иконка приложения"
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug text-[var(--ink)]">Кафетерий льгот</p>
            <p className="text-xs text-[var(--ink-subtle)] line-clamp-1">
              Установите на экран для быстрого доступа
            </p>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="shrink-0 rounded-xl bg-[var(--primary)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95"
          >
            Установить
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Закрыть"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition"
          >
            ✕
          </button>
        </div>
      </aside>
    );
  }

  // Баннер-инструкция для iOS Safari
  if (isIosPromptVisible) {
    return (
      <aside
        role="dialog"
        aria-label="Инструкция по установке на iPhone"
        className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] shadow-sm">
                <Image
                  src="/icons/apple-touch-icon.png"
                  alt="Иконка приложения"
                  width={44}
                  height={44}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Установка на iPhone / iPad</p>
                <p className="text-xs text-[var(--ink-subtle)]">Как добавить на главный экран:</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Закрыть"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition"
            >
              ✕
            </button>
          </div>

          <ol className="mt-3 space-y-2 text-xs text-[var(--ink)] pl-1">
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 font-medium text-[11px]">1</span>
              <span>Нажмите значок <strong className="font-semibold">«Поделиться»</strong> внизу Safari:</span>
              <svg className="h-4 w-4 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 font-medium text-[11px]">2</span>
              <span>В меню выберите <strong className="font-semibold">«На экран „Домой“»</strong>:</span>
              <svg className="h-4 w-4 shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </li>
          </ol>
        </div>
      </aside>
    );
  }

  return null;
}
