"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

export type BannerSlide = {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkHref: string | null;
  external: boolean;
  cta: string;
};

const AUTOPLAY_MS = 6000;

export function BannerCarousel({ slides }: { slides: BannerSlide[] }) {
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const activeRef = useRef(false);
  const startXRef = useRef(0);
  const movedRef = useRef(false);
  const widthRef = useRef(1);
  const trackRef = useRef<HTMLDivElement>(null);

  const count = slides.length;
  const clamp = useCallback((i: number) => (i + count) % count, [count]);
  const go = useCallback((i: number) => setIndex((cur) => clamp(cur + i)), [clamp]);

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setInterval(() => setIndex((c) => clamp(c + 1)), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [count, paused, clamp]);

  function onPointerDown(e: React.PointerEvent) {
    if (count < 2) return;
    activeRef.current = true;
    setDragging(true);
    movedRef.current = false;
    startXRef.current = e.clientX;
    widthRef.current = trackRef.current?.offsetWidth || 1;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!activeRef.current) return;
    const d = e.clientX - startXRef.current;
    if (Math.abs(d) > 4) movedRef.current = true;
    setDx(d);
  }
  function onPointerUp() {
    if (!activeRef.current) return;
    activeRef.current = false;
    setDragging(false);
    const threshold = widthRef.current * 0.18;
    if (dx <= -threshold) go(1);
    else if (dx >= threshold) go(-1);
    setDx(0);
  }

  return (
    <section
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="overflow-hidden rounded-[26px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "pan-y" }}
      >
        <div
          className={cx("flex", !dragging && "transition-transform duration-500 ease-out")}
          style={{ transform: `translateX(calc(${-index * 100}% + ${dx}px))` }}
        >
          {slides.map((b) => {
            const inner = (
              <>
                {b.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.imageUrl}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/5"
                />
                <div className="absolute left-4 top-4 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur">
                  Партнёр
                </div>
                <div className="relative z-10 max-w-2xl p-5 sm:p-6">
                  <h2 className="text-lg font-semibold leading-tight text-balance text-white sm:text-xl">
                    {b.title}
                  </h2>
                  {b.subtitle && (
                    <p className="mt-1.5 text-sm leading-6 text-white/85 line-clamp-2">{b.subtitle}</p>
                  )}
                  {b.linkHref && (
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                      {b.cta}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  )}
                </div>
              </>
            );
            const cls =
              "relative flex h-44 w-full shrink-0 items-end overflow-hidden border border-line bg-surface-sunken shadow-md select-none sm:h-56";
            return b.linkHref ? (
              <a
                key={b.id}
                href={b.linkHref}
                {...(b.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onClick={(e) => {
                  if (movedRef.current) e.preventDefault();
                }}
                className={cls}
              >
                {inner}
              </a>
            ) : (
              <div key={b.id} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Предыдущий баннер"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white backdrop-blur transition hover:bg-black/55"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            type="button"
            aria-label="Следующий баннер"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white backdrop-blur transition hover:bg-black/55"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Баннер ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cx(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80",
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
