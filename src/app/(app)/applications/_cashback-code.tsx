"use client";

import { useEffect, useState } from "react";
import { getMyCashbackCode } from "../cashback-actions";
import { CODE_DIGITS } from "@/lib/cashback-math";

/** Код для кассы: меняется каждые 60 секунд, показывается только владельцу счёта. */
export function CashbackCode({ title, hint, secondsLabel }: { title: string; hint: string; secondsLabel: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const r = await getMyCashbackCode().catch(() => null);
      if (!alive) return;
      if (r) {
        setCode(r.code);
        setLeft(r.secondsLeft);
        timer = setTimeout(load, r.secondsLeft * 1000 + 200);
      } else {
        timer = setTimeout(load, 10_000);
      }
    };
    void load();
    const tick = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  return (
    <div className="rounded-2xl bg-primary-soft p-4">
      <div className="text-[13px] font-bold uppercase tracking-[0.06em] text-primary-strong">{title}</div>
      <div className="mt-1 font-display text-[32px] font-bold tracking-[0.18em] text-primary" data-numeric aria-live="off">
        {code ? `${code.slice(0, CODE_DIGITS / 2)} ${code.slice(CODE_DIGITS / 2)}` : "·· ··"}
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${(left / 30) * 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {hint} <span data-numeric>({secondsLabel} {left} c)</span>
      </p>
    </div>
  );
}
