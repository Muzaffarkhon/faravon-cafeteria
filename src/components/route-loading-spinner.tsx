"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Индикатор загрузки маршрута — зафиксирован по центру вьюпорта, не зависит от скролла.
 * Рендерится порталом в <body>: внутри контента родитель с transform (.animate-page)
 * создаёт containing block, и обычный `fixed` оказывается привязан не к экрану, а к нему.
 *
 * Центрируется не по всему окну, а по видимой области <main> — иначе в админке
 * с постоянным левым меню спиннер визуально смещён влево от реального контента.
 */
export function RouteLoadingSpinner({ label }: { label: string }) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    const main = document.querySelector("main");
    const update = () => {
      if (main) {
        const r = main.getBoundingClientRect();
        setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
      } else {
        setRect({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
      }
    };
    update();
    if (!main) return;
    const ro = new ResizeObserver(update);
    ro.observe(main);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!rect) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] flex items-center justify-center"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      aria-busy="true"
      aria-label={label}
    >
      <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-primary shadow-lg" />
    </div>,
    document.body,
  );
}
