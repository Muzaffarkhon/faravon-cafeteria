/**
 * PetalDrift — ambient-слой из дрейфующих фирменных лепестков «Фаровон».
 * Форма лепестка повторяет мотив брендового паттерна. Раскладка статичная
 * (без Math.random), поэтому компонент безопасен в RSC и не даёт hydration-сдвига.
 * Уважает prefers-reduced-motion (см. globals.css).
 */
import type { CSSProperties } from "react";
import { cx } from "./ui";

type Petal = {
  left: number; // %
  size: number; // px (ширина)
  tone: "red" | "peach";
  dur: number; // c — длительность цикла
  delay: number; // c — отрицательный = «уже в полёте» при загрузке
  dx: number; // px — боковое качание
  dy: number; // доли высоты экрана — путь снизу вверх
  rot: number; // deg
  op: number;
};

// Стартуют ниже экрана (top: 120%), поднимаются на dy·100vh и растворяются.
// Отрицательные delay разбрасывают фазы, чтобы лепестки были по всей высоте сразу.
const PETALS: Petal[] = [
  { left: 3, size: 64, tone: "red", dur: 40, delay: 0, dx: 80, dy: -1.5, rot: 150, op: 0.42 },
  { left: 13, size: 40, tone: "peach", dur: 46, delay: -10, dx: -50, dy: -1.4, rot: -120, op: 0.6 },
  { left: 22, size: 92, tone: "red", dur: 52, delay: -26, dx: 40, dy: -1.6, rot: 200, op: 0.3 },
  { left: 33, size: 46, tone: "peach", dur: 38, delay: -16, dx: 90, dy: -1.35, rot: 90, op: 0.62 },
  { left: 43, size: 58, tone: "red", dur: 50, delay: -5, dx: -70, dy: -1.55, rot: -160, op: 0.36 },
  { left: 52, size: 34, tone: "peach", dur: 34, delay: -22, dx: 34, dy: -1.3, rot: 110, op: 0.6 },
  { left: 61, size: 80, tone: "red", dur: 48, delay: -34, dx: -44, dy: -1.6, rot: 220, op: 0.3 },
  { left: 71, size: 44, tone: "peach", dur: 40, delay: -13, dx: 58, dy: -1.4, rot: -90, op: 0.58 },
  { left: 80, size: 36, tone: "red", dur: 42, delay: -28, dx: -30, dy: -1.45, rot: 130, op: 0.38 },
  { left: 89, size: 50, tone: "peach", dur: 50, delay: -7, dx: 46, dy: -1.5, rot: -60, op: 0.5 },
  { left: 96, size: 30, tone: "red", dur: 54, delay: -19, dx: -22, dy: -1.55, rot: 160, op: 0.3 },
  { left: 17, size: 26, tone: "red", dur: 56, delay: -44, dx: 54, dy: -1.7, rot: 140, op: 0.26 },
  { left: 38, size: 24, tone: "peach", dur: 52, delay: -31, dx: -32, dy: -1.6, rot: -100, op: 0.4 },
  { left: 66, size: 22, tone: "red", dur: 60, delay: -48, dx: 36, dy: -1.7, rot: 90, op: 0.24 },
  { left: 85, size: 24, tone: "peach", dur: 58, delay: -38, dx: -26, dy: -1.65, rot: -70, op: 0.3 },
];

const TONE: Record<Petal["tone"], string> = {
  red: "var(--brand-500)",
  peach: "var(--petal-400)",
};

export function PetalDrift({
  className,
  count = PETALS.length,
  fixed = false,
}: {
  className?: string;
  count?: number;
  /** true — слой на весь вьюпорт (fixed); false — на ближайший relative-родитель. */
  fixed?: boolean;
}) {
  return (
    <div
      className={cx("petal-drift inset-0", fixed ? "fixed" : "absolute", className)}
      aria-hidden="true"
    >
      {PETALS.slice(0, count).map((p, i) => (
        <i
          key={i}
          style={
            {
              left: `${p.left}%`,
              top: "120%",
              "--pd-dur": `${p.dur}s`,
              "--pd-delay": `${p.delay}s`,
              "--pd-dx": `${p.dx}px`,
              "--pd-dy": `${p.dy * 100}vh`,
              "--pd-rot": `${p.rot}deg`,
              "--pd-op": p.op,
            } as CSSProperties
          }
        >
          <svg
            width={p.size}
            height={Math.round(p.size * 1.7)}
            viewBox="0 0 24 40"
            fill={TONE[p.tone]}
          >
            <path d="M12 1C5 8 4 30 12 39C20 30 19 8 12 1Z" />
          </svg>
        </i>
      ))}
    </div>
  );
}
