"use client";

import { useEffect } from "react";

/**
 * PetalDrag — физика столкновений и перетаскивания лепестков мышью.
 *
 * - Лепестки можно перемещать и бросать курсором.
 * - При контакте лепестки сталкиваются как упругие шарики (2D impulse collision),
 *   сбивая друг друга и разлетаясь пропорционально силе толчка/броска.
 * - Столкновения передаются цепочкой между лепестками.
 * - Лепестки отскакивают от границ экрана (viewport).
 * - Кинетическая энергия затухает от трения о воздух, после чего лепестки
 *   плавно продолжают свой фоновый дрейф из новых точек.
 * - Цикл анимации работает только во время движения/перетаскивания (0% CPU в покое).
 * - Тач-устройства и prefers-reduced-motion не затрагиваются.
 */
export function PetalDrag() {
  useEffect(() => {
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const layer = document.querySelector<HTMLElement>(".petal-drift");
    if (!layer || !layer.querySelector(":scope > i")) return;

    layer.classList.add("is-interactive");

    type Body = {
      el: HTMLElement;
      radius: number;
      cx: number;
      cy: number;
      offsetX: number;
      offsetY: number;
      vx: number;
      vy: number;
      isDragging: boolean;
    };

    const readOffset = (el: HTMLElement): [number, number] => {
      const raw = getComputedStyle(el).translate;
      if (raw && raw !== "none") {
        const p = raw.split(" ");
        return [parseFloat(p[0]) || 0, parseFloat(p[1]) || 0];
      }
      const m = el.style.translate.match(/-?[\d.]+/g);
      return [m?.[0] ? parseFloat(m[0]) : 0, m?.[1] ? parseFloat(m[1]) : 0];
    };

    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    const nodes = Array.from(layer.querySelectorAll<HTMLElement>(":scope > i"));
    const bodies: Body[] = nodes.map((el) => {
      const rect = el.getBoundingClientRect();
      const [offsetX, offsetY] = readOffset(el);
      return {
        el,
        radius: Math.max(16, Math.min(rect.width, rect.height) / 2),
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        offsetX,
        offsetY,
        vx: 0,
        vy: 0,
        isDragging: false,
      };
    });

    let drag: {
      body: Body;
      startX: number;
      startY: number;
      baseOffsetX: number;
      baseOffsetY: number;
      lastX: number;
      lastY: number;
      lastT: number;
      vx: number;
      vy: number;
      pid: number;
    } | null = null;

    let rafId: number | null = null;

    // Синхронизация текущих экранных координат всех лепестков перед началом движения
    const syncPositions = () => {
      for (const b of bodies) {
        if (!b.isDragging && b.vx === 0 && b.vy === 0) {
          const rect = b.el.getBoundingClientRect();
          const [ox, oy] = readOffset(b.el);
          b.radius = Math.max(16, Math.min(rect.width, rect.height) / 2);
          b.cx = rect.left + rect.width / 2;
          b.cy = rect.top + rect.height / 2;
          b.offsetX = ox;
          b.offsetY = oy;
        }
      }
    };

    const runPhysics = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      let hasActiveMotion = drag !== null;

      // 1. Интеграция скорости и затухание свободных тел
      for (const b of bodies) {
        if (b.isDragging) continue;

        const speedSq = b.vx * b.vx + b.vy * b.vy;
        if (speedSq > 0.005) {
          hasActiveMotion = true;
          b.cx += b.vx;
          b.cy += b.vy;
          b.offsetX += b.vx;
          b.offsetY += b.vy;

          // Трение о воздух (плавное замедление)
          b.vx *= 0.965;
          b.vy *= 0.965;

          // Отскок от границ viewport
          const r = b.radius;
          const BOUNCE = 0.78;
          if (b.cx - r < 0) {
            b.cx = r;
            b.vx = Math.abs(b.vx) * BOUNCE;
          } else if (b.cx + r > W) {
            b.cx = W - r;
            b.vx = -Math.abs(b.vx) * BOUNCE;
          }
          if (b.cy - r < 0) {
            b.cy = r;
            b.vy = Math.abs(b.vy) * BOUNCE;
          } else if (b.cy + r > H) {
            b.cy = H - r;
            b.vy = -Math.abs(b.vy) * BOUNCE;
          }

          b.el.style.translate = `${b.offsetX}px ${b.offsetY}px`;
        } else if (b.vx !== 0 || b.vy !== 0) {
          b.vx = 0;
          b.vy = 0;
          b.el.style.animationPlayState = "";
        }
      }

      // 2. Разрешение столкновений между всеми парами (упругий удар)
      const RESTITUTION = 0.86;
      for (let i = 0; i < bodies.length; i++) {
        const b1 = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const b2 = bodies[j];

          // Если оба покоятся и не перетаскиваются — пропускаем
          if (!b1.isDragging && !b2.isDragging && b1.vx === 0 && b1.vy === 0 && b2.vx === 0 && b2.vy === 0) {
            continue;
          }

          const dx = b2.cx - b1.cx;
          const dy = b2.cy - b1.cy;
          const distSq = dx * dx + dy * dy;
          const minDist = b1.radius + b2.radius;

          if (distSq < minDist * minDist && distSq > 0.0001) {
            hasActiveMotion = true;
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;

            // Разделение тел (устранение взаимного проникновения)
            if (b1.isDragging) {
              b2.cx += nx * overlap;
              b2.cy += ny * overlap;
              b2.offsetX += nx * overlap;
              b2.offsetY += ny * overlap;
              b2.el.style.translate = `${b2.offsetX}px ${b2.offsetY}px`;
              b2.el.style.animationPlayState = "paused";
            } else if (b2.isDragging) {
              b1.cx -= nx * overlap;
              b1.cy -= ny * overlap;
              b1.offsetX -= nx * overlap;
              b1.offsetY -= ny * overlap;
              b1.el.style.translate = `${b1.offsetX}px ${b1.offsetY}px`;
              b1.el.style.animationPlayState = "paused";
            } else {
              const sep = overlap * 0.5;
              b1.cx -= nx * sep;
              b1.cy -= ny * sep;
              b1.offsetX -= nx * sep;
              b1.offsetY -= ny * sep;
              b2.cx += nx * sep;
              b2.cy += ny * sep;
              b2.offsetX += nx * sep;
              b2.offsetY += ny * sep;
              b1.el.style.translate = `${b1.offsetX}px ${b1.offsetY}px`;
              b2.el.style.translate = `${b2.offsetX}px ${b2.offsetY}px`;
              b1.el.style.animationPlayState = "paused";
              b2.el.style.animationPlayState = "paused";
            }

            // Передача импульса
            if (b1.isDragging) {
              const vImpact = drag ? drag.vx * nx + drag.vy * ny : 0;
              const push = Math.max(vImpact * 1.35, 3.2);
              b2.vx = nx * push;
              b2.vy = ny * push;
            } else if (b2.isDragging) {
              const vImpact = drag ? -(drag.vx * nx + drag.vy * ny) : 0;
              const push = Math.max(vImpact * 1.35, 3.2);
              b1.vx = -nx * push;
              b1.vy = -ny * push;
            } else {
              const rvx = b2.vx - b1.vx;
              const rvy = b2.vy - b1.vy;
              const velAlongNormal = rvx * nx + rvy * ny;

              if (velAlongNormal < 0) {
                const impulse = -(1 + RESTITUTION) * velAlongNormal * 0.5;
                b1.vx -= impulse * nx;
                b1.vy -= impulse * ny;
                b2.vx += impulse * nx;
                b2.vy += impulse * ny;
              }
            }
          }
        }
      }

      if (hasActiveMotion) {
        rafId = requestAnimationFrame(runPhysics);
      } else {
        rafId = null;
      }
    };

    const ensureLoop = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(runPhysics);
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || drag) return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".petal-drift > i");
      if (!el) return;

      syncPositions();

      const body = bodies.find((b) => b.el === el);
      if (!body) return;

      const [baseOffsetX, baseOffsetY] = readOffset(el);
      el.style.transition = "";
      el.style.translate = `${baseOffsetX}px ${baseOffsetY}px`;
      el.style.animationPlayState = "paused";
      el.classList.add("is-dragging");

      body.offsetX = baseOffsetX;
      body.offsetY = baseOffsetY;
      body.vx = 0;
      body.vy = 0;
      body.isDragging = true;

      const now = e.timeStamp || performance.now();
      drag = {
        body,
        startX: e.clientX,
        startY: e.clientY,
        baseOffsetX,
        baseOffsetY,
        lastX: e.clientX,
        lastY: e.clientY,
        lastT: now,
        vx: 0,
        vy: 0,
        pid: e.pointerId,
      };

      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }

      ensureLoop();
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const now = e.timeStamp || performance.now();
      const dt = now - drag.lastT;

      if (dt > 0) {
        const ivx = ((e.clientX - drag.lastX) / dt) * 16.67;
        const ivy = ((e.clientY - drag.lastY) / dt) * 16.67;
        drag.vx = drag.vx * 0.4 + ivx * 0.6;
        drag.vy = drag.vy * 0.4 + ivy * 0.6;
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        drag.lastT = now;
      }

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      drag.body.offsetX = drag.baseOffsetX + dx;
      drag.body.offsetY = drag.baseOffsetY + dy;
      drag.body.el.style.translate = `${drag.body.offsetX}px ${drag.body.offsetY}px`;

      const rect = drag.body.el.getBoundingClientRect();
      drag.body.cx = rect.left + rect.width / 2;
      drag.body.cy = rect.top + rect.height / 2;

      ensureLoop();
    };

    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const { body } = drag;
      const now = e.timeStamp || performance.now();

      const stale = now - drag.lastT > 90;
      const MAX_V = 28;
      const vx = stale ? 0 : clamp(drag.vx, -MAX_V, MAX_V);
      const vy = stale ? 0 : clamp(drag.vy, -MAX_V, MAX_V);

      body.isDragging = false;
      body.vx = vx;
      body.vy = vy;
      body.el.classList.remove("is-dragging");

      drag = null;

      if (Math.hypot(vx, vy) < 0.2) {
        body.vx = 0;
        body.vy = 0;
        body.el.style.animationPlayState = "";
      } else {
        ensureLoop();
      }
    };

    layer.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      layer.classList.remove("is-interactive");
      layer.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return null;
}
