"use client";

import { useEffect } from "react";

/**
 * Лёгкий параллакс ambient-слоя лепестков за курсором. Не мешает CSS-дрейфу:
 * двигаем контейнер .petal-drift, лепестки внутри анимируются своим keyframe.
 */
export function PetalParallax() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = (e.clientX / window.innerWidth - 0.5) * 2; // -1..1
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        const layer = document.querySelector<HTMLElement>(".petal-drift");
        if (!layer) return;
        layer.style.setProperty("--pd-mx", `${(-nx * 10).toFixed(1)}px`);
        layer.style.setProperty("--pd-my", `${(-ny * 10).toFixed(1)}px`);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
