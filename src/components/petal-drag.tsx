"use client";

import { useEffect } from "react";

/**
 * Лепестки можно перетаскивать мышью. Компонент не рисует разметку — он берёт
 * узлы `.petal-drift > i`, которые уже отрендерил <PetalDrift/>, и навешивает
 * pointer-события.
 *
 * Во время перетаскивания CSS-дрейф лепестка НЕ сбрасывается, а ставится на
 * паузу (`animation-play-state: paused`), а сдвиг за курсором задаётся
 * отдельным свойством `translate` (складывается с `transform` из keyframe).
 * Так не нужен ни перезапуск анимации, ни принудительный reflow — поэтому
 * остальные лепестки не дёргаются. На отпускании `translate` плавно
 * возвращается к нулю, и дрейф продолжается ровно с того места, где замер.
 *
 * Тач-устройства и prefers-reduced-motion не трогаем.
 */
export function PetalDrag() {
  useEffect(() => {
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const layer = document.querySelector<HTMLElement>(".petal-drift");
    if (!layer || !layer.querySelector(":scope > i")) return;

    layer.classList.add("is-interactive");

    let drag: { el: HTMLElement; startX: number; startY: number; pid: number } | null = null;

    const settle = (el: HTMLElement) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.style.transition = "";
        el.style.translate = "";
        el.style.animationPlayState = "";
        el.classList.remove("is-dragging");
        el.removeEventListener("transitionend", finish);
      };
      el.addEventListener("transitionend", finish);
      // подстраховка, если translate уже был нулевым и transitionend не придёт
      window.setTimeout(finish, 520);
      el.style.transition = "translate .45s cubic-bezier(.22, 1, .36, 1)";
      el.style.translate = "0px 0px";
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || drag) return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".petal-drift > i");
      if (!el) return;
      drag = { el, startX: e.clientX, startY: e.clientY, pid: e.pointerId };
      el.classList.add("is-dragging");
      el.style.transition = "";
      el.style.animationPlayState = "paused";
      el.style.translate = "0px 0px";
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* узел мог быть заменён — не критично */
      }
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      drag.el.style.translate = `${e.clientX - drag.startX}px ${e.clientY - drag.startY}px`;
    };

    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const { el } = drag;
      drag = null;
      settle(el);
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
