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
  dy: number; // vh — путь снизу вверх (перекрывает экран)
  rot: number; // deg
  op: number;
};

// Стартуют ниже экрана (top: 118%), поднимаются на dy·vh и растворяются.
// Отрицательные delay разбрасывают фазы, чтобы лепестки были по всей высоте сразу.
const PETALS: Petal[] = [
  { left: 5, size: 30, tone: "red", dur: 34, delay: 0, dx: 60, dy: -1.4, rot: 150, op: 0.5 },
  { left: 14, size: 20, tone: "peach", dur: 40, delay: -8, dx: -40, dy: -1.35, rot: -120, op: 0.62 },
  { left: 24, size: 40, tone: "red", dur: 38, delay: -22, dx: 30, dy: -1.5, rot: 200, op: 0.4 },
  { left: 34, size: 22, tone: "peach", dur: 32, delay: -14, dx: 70, dy: -1.3, rot: 90, op: 0.64 },
  { left: 44, size: 26, tone: "red", dur: 44, delay: -4, dx: -55, dy: -1.45, rot: -160, op: 0.42 },
  { left: 53, size: 17, tone: "peach", dur: 29, delay: -19, dx: 28, dy: -1.3, rot: 110, op: 0.6 },
  { left: 63, size: 36, tone: "red", dur: 40, delay: -30, dx: -34, dy: -1.55, rot: 220, op: 0.38 },
  { left: 73, size: 21, tone: "peach", dur: 33, delay: -11, dx: 46, dy: -1.35, rot: -90, op: 0.6 },
  { left: 82, size: 16, tone: "red", dur: 36, delay: -25, dx: -24, dy: -1.4, rot: 130, op: 0.4 },
  { left: 90, size: 24, tone: "peach", dur: 42, delay: -6, dx: 38, dy: -1.4, rot: -60, op: 0.55 },
  { left: 96, size: 14, tone: "red", dur: 46, delay: -17, dx: -18, dy: -1.5, rot: 160, op: 0.3 },
  { left: 19, size: 13, tone: "red", dur: 48, delay: -37, dx: 44, dy: -1.6, rot: 140, op: 0.3 },
  { left: 39, size: 12, tone: "peach", dur: 45, delay: -28, dx: -26, dy: -1.5, rot: -100, op: 0.42 },
  { left: 68, size: 12, tone: "red", dur: 50, delay: -42, dx: 30, dy: -1.6, rot: 90, op: 0.28 },
  { left: 87, size: 11, tone: "peach", dur: 52, delay: -33, dx: -20, dy: -1.55, rot: -70, op: 0.34 },
];

const TONE: Record<Petal["tone"], string> = {
  red: "var(--brand-500)",
  peach: "var(--petal-400)",
};

export function PetalDrift({
  className,
  count = PETALS.length,
}: {
  className?: string;
  count?: number;
}) {
  return (
    <div className={cx("petal-drift", className)} aria-hidden="true">
      {PETALS.slice(0, count).map((p, i) => (
        <i
          key={i}
          style={
            {
              left: `${p.left}%`,
              top: "118%",
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
