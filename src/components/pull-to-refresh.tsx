"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 55;
const MAX_PULL = 75;

export function PullToRefresh() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [pullDistance, setPullDistance] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const hapticTriggeredRef = useRef(false);
  // Держим актуальное значение в ref, чтобы обработчики touch не зависели от
  // pullDistance и не перевешивались на каждый кадр перетаскивания.
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    // Работает только на сенсорных устройствах
    if (typeof window === "undefined" || !("ontouchstart" in window || navigator.maxTouchPoints > 0)) {
      return;
    }

    const applyPull = (d: number) => {
      pullDistanceRef.current = d;
      setPullDistance(d);
    };

    const triggerHaptic = () => {
      try {
        const tg = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (style: string) => void } } } }).Telegram?.WebApp?.HapticFeedback;
        if (tg?.impactOccurred) {
          tg.impactOccurred("light");
        } else if (navigator.vibrate) {
          navigator.vibrate(10);
        }
      } catch {}
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;

      // Проверяем, что страница в самом верху
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      if (scrollY > 1) {
        isPullingRef.current = false;
        return;
      }

      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      isPullingRef.current = true;
      hapticTriggeredRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshingRef.current) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - startYRef.current;
      const deltaX = currentX - startXRef.current;

      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      if (scrollY > 1 || deltaY <= 0) {
        if (pullDistanceRef.current > 0) {
          applyPull(0);
          setIsDragging(false);
        }
        return;
      }

      // Отсекаем горизонтальные свайпы (карусели, табы)
      if (Math.abs(deltaX) * 1.2 > deltaY) {
        return;
      }

      // Формула упругого сопротивления
      const distance = Math.min(Math.pow(deltaY, 0.8) * 1.6, MAX_PULL);

      if (distance > 6 && e.cancelable) {
        e.preventDefault();
      }

      setIsDragging(true);
      applyPull(distance);

      if (distance >= THRESHOLD && !hapticTriggeredRef.current) {
        hapticTriggeredRef.current = true;
        triggerHaptic();
      } else if (distance < THRESHOLD && hapticTriggeredRef.current) {
        hapticTriggeredRef.current = false;
      }
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;
      setIsDragging(false);

      if (pullDistanceRef.current >= THRESHOLD && !isRefreshingRef.current) {
        setIsRefreshing(true);
        applyPull(THRESHOLD);

        startTransition(() => {
          router.refresh();
        });

        setTimeout(() => {
          setIsRefreshing(false);
          applyPull(0);
        }, 850);
      } else {
        applyPull(0);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [router]);

  const isVisible = pullDistance > 6 || isRefreshing;
  const isReady = pullDistance >= THRESHOLD;

  return (
    <div
      aria-hidden="true"
      style={{
        transform: `translate3d(-50%, ${isRefreshing ? 48 : pullDistance - 44}px, 0)`,
        opacity: isVisible ? 1 : 0,
        transition: isDragging
          ? "none"
          : "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease",
      }}
      className="pointer-events-none fixed left-1/2 top-0 z-50 flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3.5 py-1.5 shadow-lg backdrop-blur-md"
    >
      {isRefreshing ? (
        <svg
          className="h-4 w-4 animate-spin text-[var(--primary)]"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      ) : (
        <svg
          style={{
            transform: `rotate(${Math.min(180, (pullDistance / THRESHOLD) * 180)}deg)`,
          }}
          className="h-4 w-4 text-[var(--primary)] transition-transform duration-75"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
        </svg>
      )}
      <span className="text-xs font-medium text-[var(--ink)]">
        {isRefreshing
          ? "Обновление…"
          : isReady
          ? "Отпустите для обновления"
          : "Потяните для обновления"}
      </span>
    </div>
  );
}
