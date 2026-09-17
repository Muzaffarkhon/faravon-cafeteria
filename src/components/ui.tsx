import React from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button --- */

type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "ghost"
  | "danger"
  | "success";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "group/btn relative inline-flex select-none items-center justify-center gap-2 " +
  "whitespace-nowrap rounded-[10px] font-semibold leading-none tracking-[-0.006em] cursor-pointer " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out " +
  "active:translate-y-px " +
  "disabled:pointer-events-none disabled:cursor-default disabled:opacity-55 disabled:shadow-none disabled:active:translate-y-0 " +
  "aria-busy:pointer-events-none aria-busy:active:translate-y-0 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // Основное действие — заливка брендом, многослойная тень, тактильное нажатие.
  primary:
    "bg-primary text-on-brand shadow-sm hover:bg-primary-hover hover:shadow-md " +
    "active:bg-primary-active active:shadow-xs",
  // Вторичное — контурная кнопка на поверхности.
  secondary:
    "border border-line-strong bg-surface text-ink shadow-xs " +
    "hover:border-line-strong hover:bg-surface-muted active:bg-surface-sunken",
  // Вторичное с акцентом — мягкая брендовая заливка.
  soft:
    "border border-primary-border/60 bg-primary-soft text-primary-strong " +
    "hover:border-primary-border hover:bg-primary-soft-hover active:bg-primary-soft-hover",
  ghost:
    "text-ink-muted hover:bg-surface-muted hover:text-ink active:bg-surface-sunken",
  danger:
    "border border-danger-border text-danger shadow-xs " +
    "hover:border-danger hover:bg-danger-soft active:bg-primary-soft-hover",
  success:
    "bg-success text-on-brand shadow-sm hover:bg-success-strong hover:shadow-md active:shadow-xs",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  // Мобильный минимум тач-таргета (HIG: 44pt) выдержан на md/lg;
  // sm — для плотных таблиц на десктопе, тоже увеличен с 32px.
  sm: "h-9 gap-1.5 px-3 text-[13px]",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-[0.9375rem]",
};

export function buttonClass(
  opts: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    className?: string;
  } = {},
): string {
  const { variant = "primary", size = "md", fullWidth, className } = opts;
  return cx(
    BUTTON_BASE,
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    fullWidth && "w-full",
    className,
  );
}

export function Button({
  variant,
  size,
  fullWidth,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      className={buttonClass({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
        />
      )}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- Form controls --- */

const CONTROL_BASE =
  // text-base на мобильных (≥16px) — иначе iOS Safari зумит страницу при фокусе;
  // на sm+ возвращаем компактный 14px.
  "control-focus rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-base text-ink sm:text-sm " +
  "shadow-xs outline-none transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-subtle " +
  "disabled:bg-surface-muted disabled:text-ink-muted aria-[invalid=true]:border-danger";

/** true, если в className уже задана ширина — тогда свой `w-full` не навязываем. */
const hasWidthClass = (c?: string) => /(?:^|\s)(?:w-|min-w-|max-w-)\S/.test(c ?? "");

export function inputClass(className?: string): string {
  return cx(CONTROL_BASE, !hasWidthClass(className) && "w-full", className);
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClass(className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={inputClass(className)} {...props} />;
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputClass(className)} {...props} />;
}

/** Подпись + подсказка + ошибка вокруг любого контрола. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-primary">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-muted">{hint}</p>}
      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- Card --- */

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-[18px] bg-surface shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("border-b border-line-subtle px-5 py-3", className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- Table --- */

// Сортировка по клику на заголовок колонки — интерактивность, поэтому вынесена
// в отдельный клиентский модуль (этот файл рендерится и на сервере); реэкспорт
// сохраняет прежний путь импорта (`@/components/ui`) для всех страниц.
export { Table } from "./table";

/**
 * Идентификатор записи в таблице — компактный чип с порядковым номером
 * создания (`seq`, обычный Postgres autoincrement: назначается один раз,
 * никогда не пересчитывается и не переиспользуется после удаления записи).
 * Полный id — в `title`; сам чип выделяется одним кликом.
 */
export function RowId({ id, seq, className }: { id: string; seq: number; className?: string }) {
  return (
    <span
      title={id}
      className={cx(
        "inline-flex select-all items-center rounded-md bg-surface-muted px-1.5 py-0.5 " +
          "font-mono text-[11px] leading-none tracking-tight text-ink-subtle tabular-nums",
        className,
      )}
    >
      #{seq}
    </span>
  );
}

/* ------------------------------------------------------------------- Badge --- */

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "accent"
  | "muted";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-ink-muted",
  brand: "bg-primary-soft text-primary-strong",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  accent: "bg-petal-100 text-petal-600",
  muted: "bg-surface-muted text-ink-subtle line-through",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        BADGE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- Page chrome --- */

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
        {description && (
          <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SectionTitle({
  children,
  count,
  className,
}: {
  children: ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <h2
      className={cx(
        "text-lg font-bold text-ink",
        className,
      )}
    >
      {children}
      {count != null && (
        <span className="ml-1.5 font-normal text-ink-subtle">({count})</span>
      )}
    </h2>
  );
}

/** Пустое состояние: сообщение + необязательное действие, на фирменной подложке. */
export function EmptyState({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-line-strong px-6 py-14 text-center",
        "bg-canvas bg-[radial-gradient(circle_at_center,var(--brand-100)_0_1.5px,transparent_1.6px)] [background-size:22px_22px]",
        className,
      )}
    >
      <p className="max-w-sm text-sm text-ink-muted">{children}</p>
      {action}
    </div>
  );
}
