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
 * остальные лепестки не дёргаются.
 *
 * На отпускании лепесток НЕ возвращается в исходную точку: по скорости за
 * последние мс перед отпусканием считается флик, и смещение по инерции едет
 * дальше, гаснущее только трением — а не отскакивает обратно к нулю. Дрейф
 * CSS-анимации возобновляется сразу же и складывается с этим смещением.
 * Итоговый сдвиг, где инерция остановилась, запоминается — если лепесток
 * подхватят снова, тащить начнут ровно оттуда, без скачка.
 *
 * Тач-устройства и prefers-reduced-motion не трогаем.
 */
const FRICTION = 0.94; // множитель скорости за кадр — чем ближе к 1, тем дольше едет
const STOP_VELOCITY = 0.02; // px/мс — ниже этого инерцию останавливаем
const VELOCITY_WINDOW_MS = 80; // из какого хвоста истории движения считаем флик

export function PetalDrag() {
  useEffect(() => {
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const layer = document.querySelector<HTMLElement>(".petal-drift");
    if (!layer || !layer.querySelector(":scope > i")) return;

    layer.classList.add("is-interactive");

    type Sample = { t: number; x: number; y: number };
    // Сдвиг, на котором осталась каждая лепестка после предыдущего флика —
    // чтобы повторный захват продолжал ровно оттуда, а не с нуля.
    const restOffset = new WeakMap<HTMLElement, { x: number; y: number }>();
    const flingRaf = new WeakMap<HTMLElement, number>();

    let drag: {
      el: HTMLElement;
      baseX: number;
      baseY: number;
      startX: number;
      startY: number;
      pid: number;
      history: Sample[];
    } | null = null;

    /** Инерционный разлёт: скорость гасится трением, смещение остаётся там, где остановилось. */
    const fling = (el: HTMLElement, x0: number, y0: number, vx: number, vy: number) => {
      let x = x0;
      let y = y0;
      const step = () => {
        vx *= FRICTION;
        vy *= FRICTION;
        x += vx * 16;
        y += vy * 16;
        el.style.translate = `${x}px ${y}px`;
        if (Math.hypot(vx, vy) < STOP_VELOCITY) {
          restOffset.set(el, { x, y });
          flingRaf.delete(el);
          el.classList.remove("is-dragging");
          return;
        }
        flingRaf.set(el, requestAnimationFrame(step));
      };
      flingRaf.set(el, requestAnimationFrame(step));
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || drag) return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".petal-drift > i");
      if (!el) return;
      const pendingRaf = flingRaf.get(el);
      if (pendingRaf != null) {
        cancelAnimationFrame(pendingRaf);
        flingRaf.delete(el);
      }
      const base = restOffset.get(el) ?? { x: 0, y: 0 };
      drag = {
        el,
        baseX: base.x,
        baseY: base.y,
        startX: e.clientX,
        startY: e.clientY,
        pid: e.pointerId,
        history: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
      };
      el.classList.add("is-dragging");
      el.style.transition = "";
      el.style.animationPlayState = "paused";
      el.style.translate = `${base.x}px ${base.y}px`;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* узел мог быть заменён — не критично */
      }
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const x = drag.baseX + (e.clientX - drag.startX);
      const y = drag.baseY + (e.clientY - drag.startY);
      drag.el.style.translate = `${x}px ${y}px`;
      drag.history.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      const cutoff = e.timeStamp - VELOCITY_WINDOW_MS;
      while (drag.history.length > 2 && drag.history[0].t < cutoff) drag.history.shift();
    };

    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const { el, baseX, baseY, startX, startY, history } = drag;
      drag = null;

      const first = history[0];
      const last = history[history.length - 1];
      const dt = Math.max(1, last.t - first.t);
      const vx = (last.x - first.x) / dt;
      const vy = (last.y - first.y) / dt;

      el.style.animationPlayState = "";
      fling(el, baseX + (e.clientX - startX), baseY + (e.clientY - startY), vx, vy);
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
