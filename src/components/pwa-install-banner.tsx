"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __pwaPrompt?: BeforeInstallPromptEvent | null;
  }
}

function checkIsEligible(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const dismissed = sessionStorage.getItem("faravon_pwa_dismissed");
    if (dismissed === "1") return false;
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
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== "undefined" && window.__pwaPrompt) {
      return window.__pwaPrompt;
    }
    return null;
  });
  const [isIosPromptVisible, setIsIosPromptVisible] = useState(false);
  const [isDesktopPromptVisible, setIsDesktopPromptVisible] = useState(false);
  const [showDesktopGuide, setShowDesktopGuide] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // 1. Безусловная регистрация Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const handlePrompt = (e: Event) => {
      const promptEvent = (e as BeforeInstallPromptEvent).prompt
        ? (e as BeforeInstallPromptEvent)
        : window.__pwaPrompt;
      if (promptEvent) {
        setDeferredPrompt(promptEvent);
      }
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("pwa-ready", handlePrompt);

    if (!checkIsEligible()) {
      return () => {
        window.removeEventListener("beforeinstallprompt", handlePrompt);
        window.removeEventListener("pwa-ready", handlePrompt);
      };
    }

    const ua = (window.navigator.userAgent || "").toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome|crios|fxios|android/.test(ua);
    const isMobile = /android|iphone|ipad|ipod/i.test(ua);

    let timer: ReturnType<typeof setTimeout> | null = null;

    if (isIos && isSafari) {
      timer = setTimeout(() => setIsIosPromptVisible(true), 1200);
    } else if (!isMobile) {
      // На ПК (десктоп Windows / Mac) показываем плашку установки
      timer = setTimeout(() => setIsDesktopPromptVisible(true), 1000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("pwa-ready", handlePrompt);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    setDeferredPrompt(null);
    setIsIosPromptVisible(false);
    setIsDesktopPromptVisible(false);
    setShowDesktopGuide(false);
    try {
      sessionStorage.setItem("faravon_pwa_dismissed", "1");
    } catch {}
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setIsDismissed(true);
        }
      } catch {}
    } else {
      // Если браузер на ПК ещё не передал prompt, показываем инструкцию для ПК
      setShowDesktopGuide(true);
    }
  };

  if (isDismissed) return null;

  // 1. Модалка-инструкция для ПК (если нажали установить, но браузер требует подтверждения в адресной строке)
  if (showDesktopGuide) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary font-bold">
                <Image src="/icons/icon-192.png" alt="Иконка" width={36} height={36} className="rounded-lg" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Установка на компьютер</h3>
                <p className="text-xs text-ink-muted">Кафетерий льгот «Фаровон»</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDesktopGuide(false)}
              className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 space-y-3 text-xs text-ink">
            <p>Чтобы установить приложение как отдельную программу Windows / macOS:</p>
            <div className="rounded-xl border border-line/70 bg-surface-muted/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">1</span>
                <span>В <b>правой части адресной строки</b> браузера нажмите значок:</span>
                <span className="rounded bg-surface px-1.5 py-0.5 border border-line font-mono text-[11px]">🖥️ ⤓</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">2</span>
                <span>Или нажмите <b>меню браузера (⋮)</b> → <b>«Установить приложение…»</b></span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setShowDesktopGuide(false)}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
            >
              Понятно
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Баннер для Android или десктопного Chrome / Edge / Yandex
  if (deferredPrompt || isDesktopPromptVisible) {
    return (
      <aside
        role="dialog"
        aria-label="Установка приложения"
        className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong,#ffffff)] p-3.5 shadow-2xl backdrop-blur-md">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] shadow-sm">
            <Image
              src="/icons/icon-192.png"
              alt="Иконка приложения"
              width={44}
              height={44}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug text-ink">Кафетерий льгот</p>
            <p className="text-xs text-ink-muted line-clamp-1">
              Установите на экран для быстрого доступа
            </p>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95 cursor-pointer"
          >
            Установить
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Закрыть"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition cursor-pointer"
          >
            ✕
          </button>
        </div>
      </aside>
    );
  }

  // 3. Баннер-инструкция для iOS Safari
  if (isIosPromptVisible) {
    return (
      <aside
        role="dialog"
        aria-label="Инструкция по установке на iPhone"
        className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-line shadow-sm">
                <Image
                  src="/icons/apple-touch-icon.png"
                  alt="Иконка приложения"
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Установка на iPhone / iPad</p>
                <p className="text-xs text-ink-muted">Как добавить сайт на экран «Домой»:</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Закрыть"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition cursor-pointer"
            >
              ✕
            </button>
          </div>

          <ol className="mt-3 space-y-2 text-xs text-ink pl-1">
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted font-bold text-[11px]">1</span>
              <span>Нажмите значок <strong className="font-semibold">«Поделиться»</strong> внизу Safari:</span>
              <svg className="h-4 w-4 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted font-bold text-[11px]">2</span>
              <span>В меню выберите <strong className="font-semibold">«На экран „Домой“»</strong>:</span>
              <svg className="h-4 w-4 shrink-0 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </li>
          </ol>
        </div>
      </aside>
    );
  }

  return null;
}
