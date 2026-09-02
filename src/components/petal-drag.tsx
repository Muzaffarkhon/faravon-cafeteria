"use client";

import { useEffect } from "react";

/**
 * Лепестки можно перетаскивать мышью. Компонент не рисует разметку — он берёт
 * узлы `.petal-drift > i`, которые уже отрендерил <PetalDrift/>, и навешивает
 * pointer-события. Во время перетаскивания CSS-дрейф этого лепестка
 * останавливается и лепесток ведётся за курсором; при отпускании он плавно
 * гаснет и возвращается в дрейф снизу.
 *
 * Тач-устройства и prefers-reduced-motion не трогаем: там лепестки остаются
 * сквозными (pointer-events управляется классом `is-interactive`).
 */
export function PetalDrag() {
  useEffect(() => {
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const layer = document.querySelector<HTMLElement>(".petal-drift");
    if (!layer || !layer.querySelector(":scope > i")) return;

    layer.classList.add("is-interactive");

    let drag:
      | { el: HTMLElement; grabX: number; grabY: number; css: string; pid: number }
      | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || drag) return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".petal-drift > i");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      drag = { el, grabX: e.clientX - cx, grabY: e.clientY - cy, css: el.style.cssText, pid: e.pointerId };
      el.classList.add("is-dragging");
      el.style.animation = "none";
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      el.style.transform = "translate(-50%, -50%)";
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* элемент мог быть заменён — не критично */
      }
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      drag.el.style.left = `${e.clientX - drag.grabX}px`;
      drag.el.style.top = `${e.clientY - drag.grabY}px`;
    };

    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const { el, css } = drag;
      drag = null;
      el.classList.remove("is-dragging");
      el.style.transition = "opacity .5s ease";
      el.style.opacity = "0";
      window.setTimeout(() => {
        el.style.cssText = css; // возвращаем исходные left%/top/переменные
        el.style.animation = "none";
        void el.offsetWidth; // reflow — чтобы keyframe стартовал заново
        el.style.animation = "";
      }, 520);
    };

    layer.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      layer.classList.remove("is-interactive");
      layer.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return null;
}
