"use client";

import { useEffect } from "react";

/**
 * Лепестки можно перетаскивать мышью. Компонент не рисует разметку — он берёт
 * узлы `.petal-drift > i`, которые уже отрендерил <PetalDrift/>, и навешивает
 * pointer-события.
 *
 * Во время перетаскивания CSS-дрейф лепестка ставится на паузу
 * (`animation-play-state: paused`), а сдвиг за курсором задаётся свойством
 * `translate` (складывается с `transform` из keyframe).
 *
 * На отпускании — БРОСОК ПО ИНЕРЦИИ: по скорости курсора в последний момент
 * лепесток пролетает ещё немного в ту же сторону с затуханием (CSS-переход с
 * ease-out), после чего сдвиг остаётся как есть и дрейф продолжается уже с новой
 * точки. Чем резче бросок — тем дальше улетает. Повторные броски складываются.
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

    // px за 1 мс, на которые бросок «доносит» лепесток по инерции.
    const FLING = 150;
    // потолок инерционного пролёта, чтобы резкий флик не улетал за экран.
    const FLING_MAX = 640;
    // максимальная учитываемая скорость курсора, px/мс.
    const V_MAX = 4;
    // после этой паузы без движения считаем, что бросок был «мягкий» (скорость 0).
    const IDLE_MS = 90;

    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    // Текущий сдвиг лепестка ("12px -30px" → [12, -30]); во время CSS-перехода
    // берём вычисленное (промежуточное) значение, а не целевое.
    const readOffset = (el: HTMLElement): [number, number] => {
      const raw = getComputedStyle(el).translate;
      if (raw && raw !== "none") {
        const p = raw.split(" ");
        return [parseFloat(p[0]) || 0, parseFloat(p[1]) || 0];
      }
      const m = el.style.translate.match(/-?[\d.]+/g);
      return [m?.[0] ? parseFloat(m[0]) : 0, m?.[1] ? parseFloat(m[1]) : 0];
    };

    let drag:
      | {
          el: HTMLElement;
          startX: number;
          startY: number;
          baseX: number;
          baseY: number;
          lastX: number;
          lastY: number;
          lastT: number;
          vx: number;
          vy: number;
          pid: number;
        }
      | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || drag) return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".petal-drift > i");
      if (!el) return;
      // Остановить возможный инерционный перелёт прямо там, где он сейчас.
      const [baseX, baseY] = readOffset(el);
      el.style.transition = "";
      el.style.translate = `${baseX}px ${baseY}px`;
      el.style.animationPlayState = "paused";
      const now = e.timeStamp || performance.now();
      drag = {
        el,
        startX: e.clientX,
        startY: e.clientY,
        baseX,
        baseY,
        lastX: e.clientX,
        lastY: e.clientY,
        lastT: now,
        vx: 0,
        vy: 0,
        pid: e.pointerId,
      };
      el.classList.add("is-dragging");
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* узел мог быть заменён — не критично */
      }
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const now = e.timeStamp || performance.now();
      const dt = now - drag.lastT;
      if (dt > 0) {
        const ivx = (e.clientX - drag.lastX) / dt;
        const ivy = (e.clientY - drag.lastY) / dt;
        // сглаживаем, чтобы дрожание руки не давало ложную скорость
        drag.vx = drag.vx * 0.6 + ivx * 0.4;
        drag.vy = drag.vy * 0.6 + ivy * 0.4;
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        drag.lastT = now;
      }
      const x = drag.baseX + (e.clientX - drag.startX);
      const y = drag.baseY + (e.clientY - drag.startY);
      drag.el.style.translate = `${x}px ${y}px`;
    };

    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const { el } = drag;
      const now = e.timeStamp || performance.now();

      const [curX, curY] = readOffset(el);
      const stale = now - drag.lastT > IDLE_MS;
      const vx = stale ? 0 : clamp(drag.vx, -V_MAX, V_MAX);
      const vy = stale ? 0 : clamp(drag.vy, -V_MAX, V_MAX);
      drag = null;

      const flingX = clamp(vx * FLING, -FLING_MAX, FLING_MAX);
      const flingY = clamp(vy * FLING, -FLING_MAX, FLING_MAX);
      const dist = Math.hypot(flingX, flingY);

      const finish = () => {
        el.style.transition = "";
        el.style.animationPlayState = "";
        el.classList.remove("is-dragging");
        el.removeEventListener("transitionend", finish);
      };

      if (dist < 4) {
        // почти не бросали — оставляем на месте, продолжаем дрейф
        finish();
        return;
      }

      // Длительность растёт со скоростью броска: 0.35–0.9 с.
      const dur = clamp(0.35 + dist / 1400, 0.35, 0.9);
      el.addEventListener("transitionend", finish);
      window.setTimeout(finish, dur * 1000 + 80); // подстраховка
      // ease-out: быстро стартует, плавно затухает — как инерция
      el.style.transition = `translate ${dur}s cubic-bezier(0.12, 0.6, 0.25, 1)`;
      el.style.translate = `${curX + flingX}px ${curY + flingY}px`;
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
