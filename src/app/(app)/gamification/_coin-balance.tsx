"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Баланс Farovon Coin с анимацией пополнения. Источник правды — `balance` с
 * сервера; предыдущее значение храним в localStorage (per-viewer, не влияет
 * на других сотрудников), чтобы поймать прирост, случившийся, пока сотрудник
 * не был на странице (ежедневный бонус, начисление за задачу ночным кроном —
 * см. хендоф от 27 сентября про gift-коины). Если баланс не вырос — тихо.
 *
 * `animated` — не null только во время самой анимации count-up; в остальное
 * время рендерим `balance` напрямую (без лишнего setState в эффекте на
 * каждый рендер).
 */
export function CoinBalance({ balance, coinUnit }: { balance: number; coinUnit: string }) {
  const [animated, setAnimated] = useState<number | null>(null);
  const [gain, setGain] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const STORAGE_KEY = "farovon:coinBalanceSeen";
    let prev: number | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      prev = raw !== null ? Number(raw) : null;
    } catch {
      /* приватный режим/заблокировано — просто не анимируем */
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(balance));
    } catch {
      /* см. выше */
    }

    if (prev === null || balance <= prev) return;

    const delta = balance - prev;
    const start = prev;
    let startTime: number | null = null;
    const DURATION = 650;
    const tick = (now: number) => {
      if (startTime === null) {
        startTime = now;
        setGain(delta); // первый кадр rAF — не тело эффекта напрямую
      }
      const progress = Math.min(1, (now - startTime) / DURATION);
      const eased = 1 - (1 - progress) ** 3;
      if (progress < 1) {
        setAnimated(Math.round(start + delta * eased));
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setAnimated(null); // готово — дальше рендерим balance напрямую
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    const hideTimer = setTimeout(() => setGain(null), 1100);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(hideTimer);
    };
  }, [balance]);

  return (
    <div className="relative inline-flex items-center">
      {gain !== null && (
        <span
          aria-hidden="true"
          className="animate-coin-float pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-bold text-success-strong"
        >
          +{gain}
        </span>
      )}
      <div
        className={cxBadge(gain !== null)}
      >
        <span data-numeric>{animated ?? balance}</span> {coinUnit}
      </div>
    </div>
  );
}

function cxBadge(gaining: boolean): string {
  const base = "rounded-full bg-primary-soft px-4 py-1.5 text-sm font-bold text-primary-strong";
  return gaining ? `${base} animate-coin-gain` : base;
}
