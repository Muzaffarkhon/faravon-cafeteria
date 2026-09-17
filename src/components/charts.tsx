"use client";

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
  const rotated = rows.length > 5;
  // Длинные подписи (название партнёра/подразделения) в развёрнутом виде не
  // помещаются между барами — сокращаем с многоточием, полное название всё
  // равно видно в подсказке (ChartTooltip берёт исходный label, а не
  // усечённый). Лимит и высота графика увеличены, чтобы обрезка случалась
  // реже — раньше 12 символов резало почти любое название подразделения.
  const truncate = (s: string) => (s.length > 20 ? `${s.slice(0, 19)}…` : s);
  return (
    <ChartFrame title={title} unit={unit} noData={rows.length === 0} tall={rotated}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, left: rotated ? 32 : -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-subtle)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            interval={0}
            angle={rotated ? -35 : 0}
            textAnchor={rotated ? "end" : "middle"}
            height={rotated ? 100 : 24}
            tickFormatter={truncate}
          />
          <YAxis tick={AXIS_STYLE} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-muted)" }} />
          <Bar dataKey="n" name="Значение" fill={color} radius={[6, 6, 0, 0]} maxBarSize={48} />
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
        <LineChart data={rows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-subtle)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_STYLE} />
          <YAxis tick={AXIS_STYLE} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="n" name="Значение" stroke={color} strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
