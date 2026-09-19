"use client";

import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Графики отчётов на дизайн-токенах системы (см. `components/ui.tsx`):
 * цвета читаются из CSS-переменных, так что графики следуют теме
 * светлого/тёмного режима без отдельной настройки.
 */

const AXIS_STYLE = { fontSize: 11, fill: "var(--ink-subtle)" };

function ChartFrame({
  title,
  unit,
  children,
  noData,
  tall,
}: {
  title: string;
  unit?: string;
  children: React.ReactNode;
  noData?: boolean;
  /** Больше места снизу под развёрнутые (наклонные) подписи категорий. */
  tall?: boolean;
}) {
  return (
    <div className="rounded-[20px] bg-surface p-6 shadow-sm sm:p-7">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {unit && <span className="text-[11px] uppercase tracking-[0.1em] text-ink-subtle">{unit}</span>}
      </div>
      {noData ? (
        <p className="mt-3 text-sm text-ink-subtle">Нет данных.</p>
      ) : (
        <div className={`mt-4 w-full ${tall ? "h-80" : "h-64"}`}>{children}</div>
      )}
    </div>
  );
}

/**
 * Подпись категории под столбцом — горизонтальная (без наклона), перенос по
 * словам в несколько строк вместо обрезки многоточием: длинные названия
 * партнёров/льгот («Тренажёрный зал «Жемчужина»») читаются целиком.
 */
function WrappedAxisTick({
  x,
  y,
  payload,
  maxCharsPerLine = 11,
  maxLines = 3,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  maxCharsPerLine?: number;
  maxLines?: number;
}) {
  const words = String(payload?.value ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (current && candidate.length > maxCharsPerLine) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    const last = shown[maxLines - 1];
    shown[maxLines - 1] = last.length > maxCharsPerLine - 1 ? `${last.slice(0, maxCharsPerLine - 1)}…` : `${last}…`;
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fontSize={11} fill="var(--ink-subtle)">
        {shown.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 12 : 13}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-subtle bg-surface px-3 py-2 text-xs shadow-md">
      <div className="font-semibold text-ink">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="text-ink-muted">
          {p.name ?? "Значение"}: <span className="font-medium text-ink">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Объёмный столбец: лицевая грань + светлая верхняя и тёмная боковая грани (косая проекция).
 * Тени и блики — полупрозрачные белый/чёрный поверх цвета столбца, поэтому работают с любым
 * цветом из темы и в светлой, и в тёмной теме.
 */
function Bar3D({ x = 0, y = 0, width = 0, height = 0, fill }: { x?: number; y?: number; width?: number; height?: number; fill?: string }) {
  const gid = useId();
  if (width <= 0 || height <= 0) return null;
  const d = Math.min(10, width * 0.24); // глубина
  const fw = width - d; // ширина лицевой грани
  const top = y + d; // верх лицевой грани
  const fh = height - d; // высота лицевой грани
  if (fh <= 0) return <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} />;
  return (
    <g>
      <defs>
        <linearGradient id={`${gid}-f`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.14" />
        </linearGradient>
      </defs>
      {/* боковая (правая) грань — темнее */}
      <polygon points={`${x + fw},${top} ${x + width},${y} ${x + width},${y + fh} ${x + fw},${y + height}`} fill={fill} />
      <polygon points={`${x + fw},${top} ${x + width},${y} ${x + width},${y + fh} ${x + fw},${y + height}`} fill="#000" fillOpacity="0.28" />
      {/* лицевая грань с мягким градиентом */}
      <rect x={x} y={top} width={fw} height={fh} fill={fill} />
      <rect x={x} y={top} width={fw} height={fh} fill={`url(#${gid}-f)`} />
      {/* верхняя грань — светлее */}
      <polygon points={`${x},${top} ${x + d},${y} ${x + width},${y} ${x + fw},${top}`} fill={fill} />
      <polygon points={`${x},${top} ${x + d},${y} ${x + width},${y} ${x + fw},${top}`} fill="#fff" fillOpacity="0.38" />
    </g>
  );
}

/** Столбчатая диаграмма (гистограмма) по подписанным категориям. */
export function BarChartCard({
  title,
  unit,
  rows,
  color = "var(--primary)",
}: {
  title: string;
  unit?: string;
  rows: { label: string; n: number }[];
  color?: string;
}) {
  // Длинные подписи (название партнёра/подразделения) не помещаются в одну
  // строку между барами — вместо наклона и обрезки многоточием переносим по
  // словам на 2-3 строки (WrappedAxisTick), подписи остаются горизонтальными
  // и читаются целиком. Область под ними увеличена под перенос.
  const wide = rows.length > 5;
  return (
    <ChartFrame title={title} unit={unit} noData={rows.length === 0} tall={wide}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-subtle)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={<WrappedAxisTick />}
            interval={0}
            height={52}
          />
          <YAxis tick={AXIS_STYLE} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-muted)" }} />
          <Bar dataKey="n" name="Значение" fill={color} shape={<Bar3D />} maxBarSize={52} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Линейный график динамики во времени. */
export function LineChartCard({
  title,
  unit,
  rows,
  color = "var(--primary)",
}: {
  title: string;
  unit?: string;
  rows: { label: string; n: number }[];
  color?: string;
}) {
  return (
    <ChartFrame title={title} unit={unit} noData={rows.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        {/* top-отступ увеличен — иначе подпись над самой высокой точкой обрезается краем графика. */}
        <LineChart data={rows} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-subtle)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_STYLE} />
          <YAxis tick={AXIS_STYLE} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="monotone"
            dataKey="n"
            name="Значение"
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            label={{ position: "top", fontSize: 11, fill: "var(--ink-subtle)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
